const PACK_COLUMNS = 'id, name, credits, price_amount, currency, active, sort';
const COLUMNS = `id, family_id, parent_id, pack_id, credits, price_amount, currency, provider, provider_ref, status,
  failure_reason, idempotency_key, created_at, paid_at, updated_at`;

export async function listPacks(db, { activeOnly = true } = {}) {
  const r = await db.query(
    `SELECT ${PACK_COLUMNS} FROM credit_packs WHERE ($1::boolean = false OR active) ORDER BY sort, id`,
    [activeOnly],
  );
  return r.rows;
}

export async function findPack(db, id) {
  const r = await db.query(`SELECT ${PACK_COLUMNS} FROM credit_packs WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function insert(db, { familyId, parentId, pack, provider, idempotencyKey = null }) {
  const r = await db.query(
    `INSERT INTO purchases (family_id, parent_id, pack_id, credits, price_amount, currency, provider, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
    [familyId, parentId, pack.id, pack.credits, pack.price_amount, pack.currency, provider, idempotencyKey],
  );
  return r.rows[0];
}

export async function findInFamily(db, id, familyId) {
  const r = await db.query(`SELECT ${COLUMNS} FROM purchases WHERE id = $1 AND family_id = $2`, [id, familyId]);
  return r.rows[0] ?? null;
}

export async function findByIdempotencyKey(db, familyId, key) {
  const r = await db.query(`SELECT ${COLUMNS} FROM purchases WHERE family_id = $1 AND idempotency_key = $2`, [familyId, key]);
  return r.rows[0] ?? null;
}

// Status-guarded: only a pending purchase can be paid, so a repeated or
// concurrent confirmation affects zero rows instead of adding credits twice.
export async function markPaid(tx, id, providerRef) {
  const r = await tx.query(
    `UPDATE purchases SET status = 'paid', provider_ref = $2, paid_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
    [id, providerRef],
  );
  return r.rows[0] ?? null;
}

export async function markFailed(db, id, reason) {
  const r = await db.query(
    `UPDATE purchases SET status = 'failed', failure_reason = $2, updated_at = now()
     WHERE id = $1 AND status = 'pending' RETURNING ${COLUMNS}`,
    [id, reason],
  );
  return r.rows[0] ?? null;
}

export async function listByFamily(db, familyId, limit = 50) {
  const r = await db.query(
    `SELECT ${COLUMNS} FROM purchases WHERE family_id = $1 ORDER BY created_at DESC, id LIMIT $2`,
    [familyId, limit],
  );
  return r.rows;
}

export function packDto(row) {
  return { id: row.id, name: row.name, credits: row.credits, price_amount: row.price_amount, currency: row.currency };
}

export function toDto(row) {
  return {
    id: row.id,
    pack_id: row.pack_id,
    credits: row.credits,
    price_amount: row.price_amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    failure_reason: row.failure_reason,
    created_at: row.created_at,
    paid_at: row.paid_at,
  };
}
