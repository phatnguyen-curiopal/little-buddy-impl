const COLUMNS = 'id, parent_id, token_hash, expires_at, revoked_at, replaced_by, created_at';

export async function insertRefreshToken(db, { parentId, tokenHash, expiresAt }) {
  const r = await db.query(
    `INSERT INTO refresh_tokens (parent_id, token_hash, expires_at)
     VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [parentId, tokenHash, expiresAt],
  );
  return r.rows[0];
}

// FOR UPDATE so two concurrent refreshes with the same token serialize: the
// second one sees revoked_at set and is treated as a replay.
export async function findByHashForUpdate(tx, tokenHash) {
  const r = await tx.query(`SELECT ${COLUMNS} FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [tokenHash]);
  return r.rows[0] ?? null;
}

export async function findByHash(db, tokenHash) {
  const r = await db.query(`SELECT ${COLUMNS} FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
  return r.rows[0] ?? null;
}

export async function revoke(db, id, replacedBy = null) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1 AND revoked_at IS NULL',
    [id, replacedBy],
  );
}

export async function revokeAllForParent(db, parentId) {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE parent_id = $1 AND revoked_at IS NULL',
    [parentId],
  );
}
