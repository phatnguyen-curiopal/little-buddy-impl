const COLUMNS = 'id, label, language, sort, is_default';

export async function list(db) {
  const r = await db.query(`SELECT ${COLUMNS} FROM voices ORDER BY language, sort, label, id`);
  return r.rows;
}

export async function findById(db, id) {
  const r = await db.query(`SELECT ${COLUMNS} FROM voices WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

// The voice a turn speaks with. A choice in the other language (an operator
// moved the voice, or an old row) never reaches TTS: it falls to the
// language's default, then any voice of that language, then any default, so
// a language without voices still speaks (the TTS voices speak both).
export async function resolve(db, voiceId = null, language = 'vi') {
  const r = await db.query(
    `SELECT id FROM voices
     ORDER BY (id = $1 AND language = $2) DESC, (language = $2 AND is_default) DESC, (language = $2) DESC,
       is_default DESC, sort, id
     LIMIT 1`,
    [voiceId, language],
  );
  return r.rows[0]?.id ?? null;
}

// Moving the default is two writes (clear the old, set the new) so the
// one-default-per-language index never sees two rows at once. sort,
// language and isDefault left null keep what an existing row has, so
// relabelling the default voice does not quietly leave its language with none.
export async function upsert(tx, { id, label, language = null, sort = null, isDefault = null }) {
  if (isDefault === true) {
    await tx.query(
      `UPDATE voices SET is_default = false
       WHERE is_default AND id <> $1
         AND language = COALESCE($2::text, (SELECT language FROM voices WHERE id = $1), 'vi')`,
      [id, language],
    );
  }
  const r = await tx.query(
    `INSERT INTO voices (id, label, language, sort, is_default)
     VALUES ($1, $2, COALESCE($3::text, 'vi'), COALESCE($4::int, 0), COALESCE($5::boolean, false))
     ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label,
       language = COALESCE($3::text, voices.language),
       sort = COALESCE($4::int, voices.sort), is_default = COALESCE($5::boolean, voices.is_default)
     RETURNING ${COLUMNS}, (xmax = 0) AS created`,
    [id, label, language, sort, isDefault],
  );
  return r.rows[0];
}

export function toDto(row) {
  return { id: row.id, label: row.label, language: row.language, is_default: row.is_default };
}
