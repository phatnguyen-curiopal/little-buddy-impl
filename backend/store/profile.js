const COLUMNS = `device_id, name, role, personality, personality_source, language, voice_id, learn, mood_pin,
  created_at, updated_at`;

// A claim always writes the whole row, settings included, so a new owner
// starts from exactly what they chose (or the defaults) and never from the
// previous family's.
export async function upsert(tx, deviceId, p) {
  const r = await tx.query(
    `INSERT INTO buddy_profiles (device_id, name, role, personality, personality_source, language, voice_id, learn, mood_pin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
       personality = EXCLUDED.personality, personality_source = EXCLUDED.personality_source,
       language = EXCLUDED.language, voice_id = EXCLUDED.voice_id, learn = EXCLUDED.learn,
       mood_pin = EXCLUDED.mood_pin, updated_at = now()
     RETURNING ${COLUMNS}`,
    [deviceId, p.name, p.role, p.personality, p.personality_source, p.language, p.voice_id, p.learn, p.mood_pin],
  );
  return r.rows[0];
}

const FIELDS = [
  ['name', 'text'],
  ['role', 'text'],
  ['personality', 'text'],
  ['personality_source', 'text'],
  ['language', 'text'],
  ['voice_id', 'text'],
  ['learn', 'boolean'],
  ['mood_pin', 'smallint'],
];

// Each field travels with a "present" flag instead of COALESCE: null is a
// real value for voice_id and mood_pin (back to default, unpinned), so
// "absent" and "null" must be told apart.
const SET_LIST = FIELDS.map(([col, type], i) => `${col} = CASE WHEN $${2 + i * 2}::boolean THEN $${3 + i * 2}::${type} ELSE ${col} END`).join(',\n       ');

export async function update(db, deviceId, patch) {
  const params = [deviceId];
  for (const [col] of FIELDS) {
    const present = Object.hasOwn(patch, col);
    params.push(present, present ? patch[col] : null);
  }
  const r = await db.query(
    `UPDATE buddy_profiles SET
       ${SET_LIST},
       updated_at = now()
     WHERE device_id = $1 RETURNING ${COLUMNS}`,
    params,
  );
  return r.rows[0] ?? null;
}

export async function findByDevice(db, deviceId) {
  const r = await db.query(`SELECT ${COLUMNS} FROM buddy_profiles WHERE device_id = $1`, [deviceId]);
  return r.rows[0] ?? null;
}
