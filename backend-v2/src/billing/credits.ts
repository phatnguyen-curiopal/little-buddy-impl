// Credits belong to the family and the ledger is append-only: every change is
// a new row and the balance is the sum. One answered turn costs one credit,
// charged in the same transaction that records the turn.

import type { Queryable } from '../db/index.ts';

export interface LedgerRow {
  id: number;
  kind: 'grant' | 'purchase' | 'debit' | 'refund';
  delta: number;
  reason: string | null;
  child_id: string | null;
  turn_id: string | null;
  purchase_id: string | null;
  created_at: Date;
}

export async function balance(q: Queryable, familyId: string): Promise<number> {
  const r = await q.query<{ n: number }>('SELECT coalesce(sum(delta), 0)::int AS n FROM credit_ledger WHERE family_id = $1', [familyId]);
  return r.rows[0].n;
}

export async function wallet(q: Queryable, familyId: string, limit: number): Promise<{ balance: number; ledger: LedgerRow[] }> {
  const [n, rows] = await Promise.all([
    balance(q, familyId),
    q.query<LedgerRow>(
      `SELECT id, kind, delta, reason, child_id, turn_id, purchase_id, created_at FROM credit_ledger
       WHERE family_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [familyId, limit],
    ),
  ]);
  return { balance: n, ledger: rows.rows };
}

// Inside the transaction that creates the family, so a family never exists
// without its welcome credits. Zero means no row (the ledger refuses 0).
export async function welcomeGrant(q: Queryable, familyId: string, credits: number): Promise<void> {
  if (credits > 0) await q.query("INSERT INTO credit_ledger (family_id, kind, delta, reason) VALUES ($1, 'grant', $2, 'welcome')", [familyId, credits]);
}

// One credit for one answered turn. A retried write charges nothing more.
export async function chargeTurn(q: Queryable, turn: { familyId: string; childId: string; turnId: string }): Promise<void> {
  await q.query(
    `INSERT INTO credit_ledger (family_id, kind, delta, reason, child_id, turn_id) VALUES ($1, 'debit', -1, 'turn', $2, $3)
     ON CONFLICT (turn_id) WHERE kind = 'debit' DO NOTHING`,
    [turn.familyId, turn.childId, turn.turnId],
  );
}
