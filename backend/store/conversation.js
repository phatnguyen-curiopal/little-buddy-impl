// Scoped by family as well as device: a toy unpaired and re-claimed within
// the idle window must not continue the previous family's conversation.
export async function findOpenForDevice(tx, deviceId, familyId, idleSec) {
  const r = await tx.query(
    `SELECT id, family_id, child_id FROM conversations
     WHERE device_id = $1 AND family_id = $2 AND last_turn_at > now() - ($3::int * interval '1 second')
     ORDER BY last_turn_at DESC LIMIT 1`,
    [deviceId, familyId, idleSec],
  );
  return r.rows[0] ?? null;
}

export async function insert(tx, { familyId, deviceId, childId = null }) {
  const r = await tx.query(
    'INSERT INTO conversations (family_id, device_id, child_id) VALUES ($1, $2, $3) RETURNING id, family_id, child_id',
    [familyId, deviceId, childId],
  );
  return r.rows[0];
}

export async function touch(tx, id) {
  await tx.query('UPDATE conversations SET last_turn_at = now() WHERE id = $1', [id]);
}
