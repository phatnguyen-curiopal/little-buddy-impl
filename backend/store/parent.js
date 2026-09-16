const COLUMNS = 'id, family_id, email, password_hash, display_name, role, last_login_at, created_at, updated_at';

export async function insert(db, { familyId, email, passwordHash, displayName = null, role = 'owner' }) {
  const r = await db.query(
    `INSERT INTO parents (family_id, email, password_hash, display_name, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [familyId, email, passwordHash, displayName, role],
  );
  return r.rows[0];
}

export async function findByEmail(db, email) {
  const r = await db.query(`SELECT ${COLUMNS} FROM parents WHERE email = $1`, [email]);
  return r.rows[0] ?? null;
}

export async function findById(db, id) {
  const r = await db.query(`SELECT ${COLUMNS} FROM parents WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function touchLastLogin(db, id) {
  await db.query('UPDATE parents SET last_login_at = now(), updated_at = now() WHERE id = $1', [id]);
}

export function toDto(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    created_at: row.created_at,
  };
}
