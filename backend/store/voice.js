const COLUMNS = 'id, label, sort, is_default';

export async function list(db) {
  const r = await db.query(`SELECT ${COLUMNS} FROM voices ORDER BY sort, label, id`);
  return r.rows;
}

// The voice a profile without a choice speaks with: the default, or the
// first one if an operator left none marked.
export async function resolve(db, voiceId = null) {
  if (voiceId) return voiceId;
  const r = await db.query('SELECT id FROM voices ORDER BY is_default DESC, sort, id LIMIT 1');
  return r.rows[0]?.id ?? null;
}

// Moving the default is two writes (clear the old, set the new) so the
// one-default unique index never sees two rows at once. sort and isDefault
// left null keep what an existing row has, so relabelling the default voice
// does not quietly leave the catalog with none.
export async function upsert(tx, { id, label, sort = null, isDefault = null }) {
  if (isDefault === true) await tx.query('UPDATE voices SET is_default = false WHERE is_default AND id <> $1', [id]);
  const r = await tx.query(
    `INSERT INTO voices (id, label, sort, is_default) VALUES ($1, $2, COALESCE($3::int, 0), COALESCE($4::boolean, false))
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label,
       sort = COALESCE($3::int, voices.sort), is_default = COALESCE($4::boolean, voices.is_default)
     RETURNING ${COLUMNS}, (xmax = 0) AS created`,
    [id, label, sort, isDefault],
  );
  return r.rows[0];
}

export function toDto(row) {
  return { id: row.id, label: row.label, is_default: row.is_default };
}
