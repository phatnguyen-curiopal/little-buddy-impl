// Buying credits, demo stage. The flow already has the two steps a payment
// provider will have: the parent opens a pending purchase, then the provider
// confirms it. payDemo stands in for that confirmation; marking a purchase
// paid and adding its credits happen in one transaction, at most once.

import { randomBytes } from 'node:crypto';

import type { Config } from '../config.ts';
import type { Db, Queryable } from '../db/index.ts';
import { HttpError, conflict, notFound } from '../util/errors.ts';
import { balance } from './credits.ts';

export interface Purchase {
  id: string;
  pack_id: string;
  credits: number;
  price_amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  failure_reason: string | null;
  created_at: Date;
  paid_at: Date | null;
}

const COLUMNS = 'id, pack_id, credits, price_amount, currency, status, failure_reason, created_at, paid_at';

function assertEnabled(cfg: Config) {
  if (cfg.web.paymentProvider !== 'demo') throw new HttpError(403, 'payments-disabled', 'Buying credits is not available yet');
}

export async function listPacks(q: Queryable) {
  const r = await q.query('SELECT id, name, credits, price_amount, currency FROM credit_pack WHERE active ORDER BY sort, id');
  return r.rows;
}

export async function listPurchases(q: Queryable, familyId: string, limit: number): Promise<Purchase[]> {
  return (await q.query<Purchase>(`SELECT ${COLUMNS} FROM purchase WHERE family_id = $1 ORDER BY created_at DESC LIMIT $2`, [familyId, limit])).rows;
}

// An idempotency key lets the site retry after a network blip without
// opening a second checkout.
export async function createPurchase(
  db: Db,
  cfg: Config,
  input: { familyId: string; parentId: string; packId: string; idempotencyKey: string | null },
): Promise<{ purchase: Purchase; created: boolean }> {
  assertEnabled(cfg);
  const existing = async () =>
    input.idempotencyKey
      ? (await db.query<Purchase>(`SELECT ${COLUMNS} FROM purchase WHERE family_id = $1 AND idempotency_key = $2`, [input.familyId, input.idempotencyKey])).rows[0]
      : undefined;
  const before = await existing();
  if (before) {
    if (before.pack_id !== input.packId) throw new HttpError(422, 'idempotency-key-reused', 'This Idempotency-Key was used for another pack');
    return { purchase: before, created: false };
  }
  const pack = (await db.query<{ credits: number; price_amount: number; currency: string }>(
    'SELECT credits, price_amount, currency FROM credit_pack WHERE id = $1 AND active',
    [input.packId],
  )).rows[0];
  if (!pack) throw notFound('credit pack');
  try {
    const r = await db.query<Purchase>(
      `INSERT INTO purchase (family_id, parent_id, pack_id, credits, price_amount, currency, provider, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, 'demo', $7) RETURNING ${COLUMNS}`,
      [input.familyId, input.parentId, input.packId, pack.credits, pack.price_amount, pack.currency, input.idempotencyKey],
    );
    return { purchase: r.rows[0], created: true };
  } catch (err) {
    // Two identical requests racing: the loser returns the winner's row.
    const again = (err as { code?: string }).code === '23505' ? await existing() : undefined;
    if (again) return { purchase: again, created: false };
    throw err;
  }
}

export async function payDemo(db: Db, cfg: Config, input: { familyId: string; purchaseId: string; outcome: 'success' | 'decline' }) {
  assertEnabled(cfg);
  return db.tx(async (q) => {
    const found = await q.query('SELECT 1 FROM purchase WHERE id = $1 AND family_id = $2', [input.purchaseId, input.familyId]);
    if (!found.rowCount) throw notFound('purchase');
    const settled = conflict('purchase-not-pending', 'This purchase is already settled');
    if (input.outcome === 'decline') {
      const r = await q.query<Purchase>(
        `UPDATE purchase SET status = 'failed', failure_reason = 'card_declined' WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
        [input.purchaseId],
      );
      if (!r.rows[0]) throw settled;
      return { purchase: r.rows[0], balance: await balance(q, input.familyId) };
    }
    const r = await q.query<Purchase>(
      `UPDATE purchase SET status = 'paid', paid_at = now(), provider_ref = $2 WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
      [input.purchaseId, `demo_${randomBytes(8).toString('hex')}`],
    );
    if (!r.rows[0]) throw settled;
    await q.query(
      "INSERT INTO credit_ledger (family_id, kind, delta, reason, purchase_id) VALUES ($1, 'purchase', $2, $3, $4)",
      [input.familyId, r.rows[0].credits, `pack:${r.rows[0].pack_id}`, input.purchaseId],
    );
    return { purchase: r.rows[0], balance: await balance(q, input.familyId) };
  });
}
