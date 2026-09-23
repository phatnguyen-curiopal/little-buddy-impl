-- Turns within the follow-up window share a conversation. device_id is
-- SET NULL, never CASCADE: deleting a toy must not delete turns and, through
-- them, the debit rows that make up a family's balance.
CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  device_id     uuid REFERENCES devices(id) ON DELETE SET NULL,
  child_id      uuid REFERENCES children(id) ON DELETE SET NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_turn_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_device_idx ON conversations (device_id, last_turn_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX conversations_family_idx ON conversations (family_id);

-- One row per button press that reached the gate (except an unclaimed toy,
-- which has no family to show it to). An 'accepted' row is the reservation
-- of one credit until the turn completes or is abandoned; 'failed' is a
-- pipeline error that spoke a canned fallback and never charges.
CREATE TABLE turns (
  id               uuid PRIMARY KEY,
  conversation_id  uuid REFERENCES conversations(id) ON DELETE SET NULL,
  family_id        uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  device_id        uuid REFERENCES devices(id) ON DELETE SET NULL,
  child_id         uuid REFERENCES children(id) ON DELETE SET NULL,
  status           text NOT NULL CHECK (status IN ('accepted', 'denied', 'completed', 'abandoned', 'failed')),
  denied_reason    text CHECK (denied_reason IN ('not_claimed', 'disabled', 'no_credits', 'daily_limit', 'quiet_hours')),
  emotion          text,
  answer_text      text,
  audio_frames     int NOT NULL DEFAULT 0,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  CHECK ((status = 'denied') = (denied_reason IS NOT NULL))
);
CREATE INDEX turns_family_idx ON turns (family_id, started_at DESC);
CREATE INDEX turns_inflight_idx ON turns (family_id) WHERE status = 'accepted';

-- Append-only. The balance is SUM(delta). A debit is always exactly one
-- credit for exactly one turn, and the partial unique index makes a second
-- debit for the same turn impossible. turn_id cascades (never SET NULL) so
-- a family deletion cannot leave a debit row that violates the CHECK.
CREATE TABLE credit_ledger (
  id          bigserial PRIMARY KEY,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('grant', 'purchase', 'debit', 'refund', 'expiry')),
  delta       int  NOT NULL,
  turn_id     uuid REFERENCES turns(id) ON DELETE CASCADE,
  reason      text,
  actor_kind  text NOT NULL CHECK (actor_kind IN ('system', 'admin', 'parent', 'device')),
  actor_id    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind IN ('grant', 'purchase', 'refund') AND delta > 0) OR (kind IN ('debit', 'expiry') AND delta < 0)),
  CHECK (kind <> 'debit' OR (turn_id IS NOT NULL AND delta = -1))
);
CREATE UNIQUE INDEX credit_ledger_debit_turn_idx ON credit_ledger (turn_id) WHERE kind = 'debit';
CREATE INDEX credit_ledger_family_idx ON credit_ledger (family_id, id DESC);
