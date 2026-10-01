// Scoped by family as well as device: a toy unpaired and re-claimed within
// the idle window must not continue the previous family's conversation.
// The child must match too (NULL matching NULL), so reassigning the toy to
// another child starts a new conversation instead of continuing the old
// child's; and a conversation the toy ended explicitly stays ended.
export async function findOpenForDevice(tx, deviceId, familyId, childId, idleSec) {
  const r = await tx.query(
    `SELECT id, family_id, child_id FROM conversations
     WHERE device_id = $1 AND family_id = $2 AND child_id IS NOT DISTINCT FROM $3::uuid AND ended_at IS NULL
       AND last_turn_at > now() - ($4::int * interval '1 second')
     ORDER BY last_turn_at DESC LIMIT 1`,
    [deviceId, familyId, childId, idleSec],
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

// Ends every still-open conversation of this toy in this family; the next
// turn then starts a fresh one.
export async function endOpenForDevice(db, deviceId, familyId) {
  const r = await db.query(
    'UPDATE conversations SET ended_at = now() WHERE device_id = $1 AND family_id = $2 AND ended_at IS NULL',
    [deviceId, familyId],
  );
  return r.rowCount;
}
