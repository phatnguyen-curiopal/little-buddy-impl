-- What the parent website needs, carried over from the first backend: sign-in
-- with a password, a family name, credits and purchases, a voice and one of
-- 16 personality types for each Buddy, toys a parent can pause, the claim
-- code printed on the box, and Buddies that live only in the browser.

ALTER TABLE family ADD COLUMN name text CHECK (name IS NULL OR length(name) BETWEEN 1 AND 80);

-- scrypt with its parameters in the string; NULL for parents who only use an
-- emailed code, Apple or Google.
ALTER TABLE parent_user ADD COLUMN password_hash text;

-- Signing up with a password proves nothing about the email address, so
-- those accounts get their own provider and no verified date. An emailed
-- code or Apple or Google proves it; such a sign-in may then link to an
-- account with the same address only once that address is verified (see
-- findOrCreateParent). Every earlier account came from one of those.
ALTER TABLE parent_user DROP CONSTRAINT parent_user_auth_provider_check;
ALTER TABLE parent_user ADD CONSTRAINT parent_user_auth_provider_check CHECK (auth_provider IN ('email', 'password', 'apple', 'google'));
ALTER TABLE parent_user ADD COLUMN email_verified_at timestamptz;
UPDATE parent_user SET email_verified_at = created_at;

-- Credits ---------------------------------------------------------------------

-- What a family can buy. Packs are deactivated, never deleted, because
-- purchases point at them.
CREATE TABLE credit_pack (
  id           text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,32}$'),
  name         text NOT NULL,
  credits      integer NOT NULL CHECK (credits > 0),
  price_amount integer NOT NULL CHECK (price_amount >= 0),
  currency     text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  active       boolean NOT NULL DEFAULT true,
  sort         integer NOT NULL DEFAULT 0
);

INSERT INTO credit_pack (id, name, credits, price_amount, currency, sort) VALUES
  ('starter', 'Starter', 20, 49000, 'VND', 1),
  ('family', 'Family', 60, 129000, 'VND', 2),
  ('big', 'Big box', 150, 299000, 'VND', 3);

-- One checkout. Credits and price are copied from the pack so a later price
-- change never rewrites what a family paid for; the status only moves
-- pending -> paid or pending -> failed.
CREATE TABLE purchase (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       uuid NOT NULL REFERENCES family (id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES parent_user (id) ON DELETE SET NULL,
  pack_id         text NOT NULL REFERENCES credit_pack (id),
  credits         integer NOT NULL CHECK (credits > 0),
  price_amount    integer NOT NULL CHECK (price_amount >= 0),
  currency        text NOT NULL,
  provider        text NOT NULL CHECK (provider IN ('demo')),
  provider_ref    text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  failure_reason  text,
  idempotency_key text CHECK (length(idempotency_key) BETWEEN 1 AND 64),
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);
CREATE UNIQUE INDEX purchase_idempotency_uq ON purchase (family_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX purchase_family_idx ON purchase (family_id, created_at DESC);

-- Append-only: the balance is SUM(delta). A debit is one credit for one
-- answered turn, a purchase row adds its credits once, and the unique
-- indexes make a second charge or a second top-up impossible.
CREATE TABLE credit_ledger (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  family_id   uuid NOT NULL REFERENCES family (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('grant', 'purchase', 'debit', 'refund')),
  delta       integer NOT NULL CHECK (delta <> 0),
  reason      text,
  child_id    uuid REFERENCES child (id) ON DELETE SET NULL,
  turn_id     uuid,                     -- soft reference: turns are dropped after 30 days
  purchase_id uuid REFERENCES purchase (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'debit') = (delta < 0)),
  CHECK ((kind = 'debit') = (turn_id IS NOT NULL)),
  CHECK ((kind = 'purchase') = (purchase_id IS NOT NULL))
);
CREATE INDEX credit_ledger_family_idx ON credit_ledger (family_id, created_at DESC);
CREATE UNIQUE INDEX credit_ledger_turn_uq ON credit_ledger (turn_id) WHERE kind = 'debit';
CREATE UNIQUE INDEX credit_ledger_purchase_uq ON credit_ledger (purchase_id) WHERE kind = 'purchase';

-- Families from before credits start with the demo stage's welcome credits,
-- as every family made from now on does.
INSERT INTO credit_ledger (family_id, kind, delta, reason) SELECT id, 'grant', 1000, 'welcome' FROM family;

-- A credit held for a turn while it runs, so two toys of one family cannot
-- both start a turn on the last credit. The answer's charge replaces it, any
-- other ending releases it, and it lapses on its own after a few minutes.
CREATE TABLE credit_hold (
  id         uuid PRIMARY KEY,
  family_id  uuid NOT NULL REFERENCES family (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX credit_hold_family_idx ON credit_hold (family_id, expires_at);

-- Buddy: voice and personality type -------------------------------------------

-- The voices a parent can pick, each speaking one language. A Buddy with no
-- voice picked speaks with its character's own voice.
CREATE TABLE voice (
  id       text PRIMARY KEY,            -- the ElevenLabs voice id
  name     text NOT NULL,
  language text NOT NULL CHECK (language IN ('vi', 'en')),
  sort     integer NOT NULL DEFAULT 0
);

INSERT INTO voice (id, name, language, sort) VALUES
  ('mgBpvrNosWzExdPuRbXP', 'Phan Anh', 'vi', 0),
  ('x4KAhuXs2G8TfK9Zr7Q4', 'Cam Hong', 'vi', 1),
  ('fBD19tfE58bkETeiwUoC', 'Little Dude II', 'en', 0),
  ('87n4zM8Wuy87vFILuKvE', 'Ziggy', 'en', 1),
  ('e79twtVS2278lVZZQiAD', 'The Elf', 'en', 2);

-- One of the 16 types (ENFP); setting it also sets the five dials.
ALTER TABLE character_instance ADD COLUMN personality text CHECK (personality IS NULL OR personality ~ '^[EI][NS][FT][JP]$');
ALTER TABLE character_instance ADD COLUMN voice_id text REFERENCES voice (id);

-- Toys ------------------------------------------------------------------------

-- Who paused a disabled toy: a parent can wake only a toy a parent paused.
ALTER TABLE device ADD COLUMN disabled_by text CHECK (disabled_by IN ('parent', 'staff'));

-- The code printed on the box, hashed with a key derived from DEVICE_KEK, so
-- a parent without the app's Bluetooth pairing can still claim a toy.
ALTER TABLE device ADD COLUMN claim_code_hash text UNIQUE;
