const COLUMNS = 'id, family_id, name, birth_year, created_at';

export async function insert(db, { familyId, name, birthYear }) {
  const r = await db.query(
    `INSERT INTO children (family_id, name, birth_year) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [familyId, name, birthYear],
  );
  return r.rows[0];
}

export async function listByFamily(db, familyId) {
  const r = await db.query(`SELECT ${COLUMNS} FROM children WHERE family_id = $1 ORDER BY created_at, id`, [familyId]);
  return r.rows;
}

// Scoped by family on purpose: a child id from another family is "not found".
export async function findInFamily(db, id, familyId) {
  const r = await db.query(`SELECT ${COLUMNS} FROM children WHERE id = $1 AND family_id = $2`, [id, familyId]);
  return r.rows[0] ?? null;
}

export function toDto(row) {
  return { id: row.id, name: row.name, birth_year: row.birth_year, created_at: row.created_at };
}
