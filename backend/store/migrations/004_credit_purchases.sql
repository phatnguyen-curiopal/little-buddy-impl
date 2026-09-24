-- What a family can buy. Reference data: packs are deactivated, never
-- deleted, because purchases point at them.
CREATE TABLE credit_packs (
  id            text PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,32}$'),
  name          text NOT NULL,
  credits       int  NOT NULL CHECK (credits > 0),
  price_amount  int  NOT NULL CHECK (price_amount >= 0),
  currency      text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  active        boolean NOT NULL DEFAULT true,
  sort          int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO credit_packs (id, name, credits, price_amount, currency, sort) VALUES
  ('starter', 'Starter', 20, 49000, 'VND', 1),
  ('family', 'Family', 60, 129000, 'VND', 2),
  ('big', 'Big box', 150, 299000, 'VND', 3);

-- One checkout. Credits and price are copied from the pack at creation so a
-- later price change never rewrites what a family paid for. The status only
-- moves pending -> paid or pending -> failed; the move to paid and the
-- ledger row that adds the credits happen in one transaction.
CREATE TABLE purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id        uuid REFERENCES parents(id) ON DELETE SET NULL,
  pack_id          text NOT NULL REFERENCES credit_packs(id),
  credits          int  NOT NULL CHECK (credits > 0),
  price_amount     int  NOT NULL CHECK (price_amount >= 0),
  currency         text NOT NULL,
  provider         text NOT NULL CHECK (provider IN ('demo')),
  provider_ref     text,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  failure_reason   text,
  idempotency_key  text CHECK (length(idempotency_key) BETWEEN 1 AND 64),
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);
CREATE UNIQUE INDEX purchases_idempotency_idx ON purchases (family_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX purchases_family_idx ON purchases (family_id, created_at DESC);

-- A purchase row in the ledger always points at its purchase, and a
-- purchase can add credits at most once. CASCADE, never SET NULL, so a
-- family deletion cannot leave a purchase row that violates the check.
ALTER TABLE credit_ledger ADD COLUMN purchase_id uuid REFERENCES purchases(id) ON DELETE CASCADE;
ALTER TABLE credit_ledger ADD CONSTRAINT credit_ledger_purchase_link CHECK ((kind = 'purchase') = (purchase_id IS NOT NULL));
CREATE UNIQUE INDEX credit_ledger_purchase_idx ON credit_ledger (purchase_id) WHERE kind = 'purchase';
