const COLUMNS = 'id, name, created_at, updated_at';

export async function insert(db, { name }) {
  const r = await db.query(`INSERT INTO families (name) VALUES ($1) RETURNING ${COLUMNS}`, [name]);
  return r.rows[0];
}

export async function findById(db, id) {
  const r = await db.query(`SELECT ${COLUMNS} FROM families WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export function toDto(row) {
  return { id: row.id, name: row.name, created_at: row.created_at };
}
