// Credits belong to the family and the ledger is append-only: every change is
// a new row and the balance is the sum. One answered turn costs one credit,
// charged in the same transaction that records the turn.

import type { Db, Queryable } from '../db/index.ts';

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

// Holds a credit for a turn that is starting, under the family row's lock:
// the balance minus the holds still running must cover it, so two toys of
// one family cannot both start a turn on the last credit. A hold lapses on
// its own, so one that is never released costs a credit for minutes, not for good.
export async function reserveCredit(db: Db, familyId: string, holdId: string, ttlSec = 180): Promise<boolean> {
  return db.tx(async (q) => {
    await q.query('SELECT 1 FROM family WHERE id = $1 FOR UPDATE', [familyId]);
    await q.query('DELETE FROM credit_hold WHERE family_id = $1 AND expires_at <= now()', [familyId]);
    const r = await q.query<{ free: number }>(
      `SELECT (SELECT coalesce(sum(delta), 0) FROM credit_ledger WHERE family_id = $1)
            - (SELECT count(*) FROM credit_hold WHERE family_id = $1) AS free`,
      [familyId],
    );
    if (Number(r.rows[0].free) < 1) return false;
    await q.query('INSERT INTO credit_hold (id, family_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))', [holdId, familyId, ttlSec]);
    return true;
  });
}

// A turn that ends without an answer to charge gives its credit back.
export async function releaseCredit(q: Queryable, holdId: string): Promise<void> {
  await q.query('DELETE FROM credit_hold WHERE id = $1', [holdId]);
}

// One credit for one answered turn, taking the place of its hold. A retried
// write charges nothing more.
export async function chargeTurn(q: Queryable, turn: { familyId: string; childId: string; turnId: string; hold?: string | null }): Promise<void> {
  if (turn.hold) await releaseCredit(q, turn.hold);
  await q.query(
    `INSERT INTO credit_ledger (family_id, kind, delta, reason, child_id, turn_id) VALUES ($1, 'debit', -1, 'turn', $2, $3)
     ON CONFLICT (turn_id) WHERE kind = 'debit' DO NOTHING`,
    [turn.familyId, turn.childId, turn.turnId],
  );
}
