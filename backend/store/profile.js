const COLUMNS = 'device_id, name, role, personality, personality_source, created_at, updated_at';

// A claim always writes the whole row, so a new owner starts from exactly
// what they chose (or the defaults) and never from the previous family's.
export async function upsert(tx, deviceId, { name, role, personality, personality_source: source }) {
  const r = await tx.query(
    `INSERT INTO buddy_profiles (device_id, name, role, personality, personality_source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role,
       personality = EXCLUDED.personality, personality_source = EXCLUDED.personality_source, updated_at = now()
     RETURNING ${COLUMNS}`,
    [deviceId, name, role, personality, source],
  );
  return r.rows[0];
}

export async function update(db, deviceId, patch) {
  const r = await db.query(
    `UPDATE buddy_profiles SET
       name = COALESCE($2, name), role = COALESCE($3, role), personality = COALESCE($4, personality),
       personality_source = COALESCE($5, personality_source), updated_at = now()
     WHERE device_id = $1 RETURNING ${COLUMNS}`,
    [deviceId, patch.name ?? null, patch.role ?? null, patch.personality ?? null, patch.personality_source ?? null],
  );
  return r.rows[0] ?? null;
}
