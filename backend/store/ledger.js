const COLUMNS = 'id, family_id, kind, delta, turn_id, reason, actor_kind, actor_id, created_at';

export async function insert(db, { familyId, kind, delta, turnId = null, reason = null, actorKind, actorId = null }) {
  const r = await db.query(
    `INSERT INTO credit_ledger (family_id, kind, delta, turn_id, reason, actor_kind, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
    [familyId, kind, delta, turnId, reason, actorKind, actorId],
  );
  return r.rows[0];
}

// Idempotent on the turn: the ON CONFLICT target must repeat the partial
// index predicate or Postgres cannot match it. Returns false when the turn
// was already debited.
export async function insertDebit(tx, { familyId, turnId, actorId = null }) {
  const r = await tx.query(
    `INSERT INTO credit_ledger (family_id, kind, delta, turn_id, reason, actor_kind, actor_id)
     VALUES ($1, 'debit', -1, $2, 'turn', 'device', $3)
     ON CONFLICT (turn_id) WHERE kind = 'debit' DO NOTHING`,
    [familyId, turnId, actorId],
  );
  return r.rowCount === 1;
}

export async function balance(db, familyId) {
  const r = await db.query('SELECT COALESCE(SUM(delta), 0)::int AS balance FROM credit_ledger WHERE family_id = $1', [familyId]);
  return r.rows[0].balance;
}

export async function listByFamily(db, familyId, limit = 50) {
  const r = await db.query(
    `SELECT ${COLUMNS} FROM credit_ledger WHERE family_id = $1 ORDER BY id DESC LIMIT $2`,
    [familyId, limit],
  );
  return r.rows;
}

export function toDto(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    delta: row.delta,
    turn_id: row.turn_id,
    reason: row.reason,
    actor_kind: row.actor_kind,
    created_at: row.created_at,
  };
}
