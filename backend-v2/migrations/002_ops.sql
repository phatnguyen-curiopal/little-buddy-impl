-- Operational tables the API and workers need beyond the domain schema:
-- parent sessions, email sign-in codes, idempotency, push tokens, the job
-- queue, and the functions that keep turn partitions to 30 days.

CREATE TABLE refresh_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid NOT NULL REFERENCES parent_user (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,     -- sha256 of the opaque token; the token itself is never stored
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  replaced_by uuid,                     -- set on rotation; presenting a replaced token means it leaked
  revoked_at  timestamptz
);
CREATE INDEX refresh_token_parent_idx ON refresh_token (parent_id);

CREATE TABLE email_login (
  email      text PRIMARY KEY,          -- lower-cased
  code_hash  text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   smallint NOT NULL DEFAULT 0
);

CREATE TABLE idempotency_key (
  parent_id  uuid NOT NULL REFERENCES parent_user (id) ON DELETE CASCADE,
  key        text NOT NULL,
  route      text NOT NULL,
  status     smallint NOT NULL,
  body       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, key)
);

CREATE TABLE push_token (
  token      text PRIMARY KEY,
  parent_id  uuid NOT NULL REFERENCES parent_user (id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A Postgres-backed queue, so a single-server deployment needs no SQS. The
-- partial unique index lets a job carry a dedupe key that frees up once the
-- job finishes, which is how the scheduler enqueues "once per child per day".
CREATE TABLE job (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  queue        text NOT NULL,
  payload      jsonb NOT NULL,
  dedupe_key   text,
  run_at       timestamptz NOT NULL DEFAULT now(),
  attempts     smallint NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'running', 'done', 'dead')),
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE UNIQUE INDEX job_dedupe_uq ON job (queue, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('ready', 'running');
CREATE INDEX job_ready_idx ON job (run_at) WHERE status = 'ready';

-- Creates the UTC-day partition a turn lands in. Two voice processes can race
-- on the first turn of a day; the loser's duplicate_table is harmless.
CREATE FUNCTION ensure_turn_partition(d date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  part text := 'turn_' || to_char(d, 'YYYY_MM_DD');
BEGIN
  IF to_regclass(part) IS NULL THEN
    EXECUTE format('CREATE TABLE %I PARTITION OF turn FOR VALUES FROM (%L) TO (%L)',
                   part, d::text || ' 00:00+00', (d + 1)::text || ' 00:00+00');
  END IF;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

-- Drops every turn partition for a day before the cutoff. Dropping a whole
-- partition is how the 30-day rule deletes words without a slow DELETE.
CREATE FUNCTION drop_turn_partitions_before(cutoff date) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  r record;
  dropped integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'turn' AND c.relname ~ '^turn_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
  LOOP
    IF to_date(substr(r.relname, 6), 'YYYY_MM_DD') < cutoff THEN
      EXECUTE format('DROP TABLE %I', r.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END $$;
