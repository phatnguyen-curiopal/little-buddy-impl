// Days travel as 'YYYY-MM-DD' strings in both directions (to_char out,
// ::date in): a DATE parsed into a JS Date lands at some midnight in some
// timezone, and the brain has exactly one day-key convention.

export async function backstory(q, role, lang) {
  const { rows } = await q.query('SELECT backstory FROM backstories WHERE role = $1 AND lang = $2', [role, lang]);
  return rows[0]?.backstory ?? null;
}

// Newest first, today included, future pages excluded.
export async function diary(q, role, lang, today, limit) {
  const { rows } = await q.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, story, valence
       FROM diary
      WHERE role = $1 AND lang = $2 AND day <= $3::date
      ORDER BY day DESC
      LIMIT $4`,
    [role, lang, today, limit],
  );
  return rows;
}

export async function mood(q, deviceId, day) {
  const { rows } = await q.query(
    `SELECT score, to_char(reason_day, 'YYYY-MM-DD') AS reason_day
       FROM moods WHERE device_id = $1 AND day = $2::date`,
    [deviceId, day],
  );
  return rows[0] || null;
}

// Two turns racing at midnight both settle on whichever row landed first.
export async function insertMood(q, deviceId, day, score, reasonDay) {
  await q.query(
    `INSERT INTO moods (device_id, day, score, reason_day) VALUES ($1, $2::date, $3, $4::date)
     ON CONFLICT (device_id, day) DO NOTHING`,
    [deviceId, day, score, reasonDay],
  );
}

export async function upsertBackstory(q, role, lang, text, { overwrite = false } = {}) {
  const { rowCount } = await q.query(
    `INSERT INTO backstories (role, lang, backstory) VALUES ($1, $2, $3)
     ON CONFLICT (role, lang) DO ${overwrite ? 'UPDATE SET backstory = EXCLUDED.backstory' : 'NOTHING'}`,
    [role, lang, text],
  );
  return rowCount;
}

export async function insertDiary(q, { role, lang, day, story, valence }) {
  const { rowCount } = await q.query(
    `INSERT INTO diary (role, lang, day, story, valence) VALUES ($1, $2, $3::date, $4, $5)
     ON CONFLICT (role, lang, day) DO NOTHING`,
    [role, lang, day, story, valence],
  );
  return rowCount;
}

export async function wipeDiary(q, roles) {
  const { rowCount } = await q.query('DELETE FROM diary WHERE role = ANY($1)', [roles]);
  return rowCount;
}
