-- Created here, on an empty database, so no later migration needs a
-- superuser step when the memory tables arrive.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One login per email; a family may have several logins.
CREATE TABLE parents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  email          text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash  text NOT NULL,
  display_name   text,
  role           text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'member')),
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parents_family_idx ON parents (family_id);

-- Only the sha256 of the opaque refresh token is stored; replaced_by links the
-- rotation chain so a replayed old token can be recognized as a leak.
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  replaced_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_parent_idx ON refresh_tokens (parent_id);

CREATE TABLE children (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  birth_year  int  NOT NULL CHECK (birth_year BETWEEN 2000 AND 2100),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX children_family_idx ON children (family_id);

CREATE TABLE device_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label         text NOT NULL UNIQUE,
  hardware_rev  text NOT NULL,
  size          int  NOT NULL CHECK (size > 0),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- id is the device_id the firmware signs with; serial is the printed label.
-- The HMAC secret must be recoverable for verification, so it is encrypted
-- under DEVICE_KEK rather than hashed. The claim code is stored only as a
-- peppered hash: it is short enough to brute-force from a plain hash.
CREATE TABLE devices (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serial                  text NOT NULL UNIQUE,
  batch_id                uuid NOT NULL REFERENCES device_batches(id),
  hardware_rev            text NOT NULL,
  secret_enc              text NOT NULL,
  secret_prev_enc         text,
  secret_prev_expires_at  timestamptz,
  claim_code_hash         text NOT NULL UNIQUE,
  status                  text NOT NULL DEFAULT 'provisioned'
                          CHECK (status IN ('provisioned', 'active', 'disabled', 'revoked')),
  status_reason           text,
  disabled_by             text CHECK (disabled_by IN ('parent', 'admin')),
  family_id               uuid REFERENCES families(id) ON DELETE SET NULL,
  child_id                uuid REFERENCES children(id) ON DELETE SET NULL,
  firmware_version        text,
  last_seen_at            timestamptz,
  claimed_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (child_id IS NULL OR family_id IS NOT NULL),
  CHECK ((status = 'disabled') = (disabled_by IS NOT NULL))
);
CREATE INDEX devices_family_idx ON devices (family_id) WHERE family_id IS NOT NULL;
CREATE INDEX devices_batch_idx  ON devices (batch_id);
CREATE INDEX devices_status_idx ON devices (status);

-- Audit trail of every lifecycle transition. detail carries ids only.
CREATE TABLE device_events (
  id          bigserial PRIMARY KEY,
  device_id   uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event       text NOT NULL,
  actor_kind  text NOT NULL,
  actor_id    text,
  detail      jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_events_device_idx ON device_events (device_id, at DESC);
