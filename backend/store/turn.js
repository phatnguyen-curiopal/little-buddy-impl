const COLUMNS = 'id, conversation_id, family_id, device_id, child_id, status, denied_reason, emotion, answer_text, audio_frames, started_at, ended_at';

const STALE = "started_at > now() - ($STALE::int * interval '1 second')";

export async function insertAccepted(tx, { id, conversationId, familyId, deviceId, childId = null }) {
  const r = await tx.query(
    `INSERT INTO turns (id, conversation_id, family_id, device_id, child_id, status)
     VALUES ($1, $2, $3, $4, $5, 'accepted') RETURNING ${COLUMNS}`,
    [id, conversationId, familyId, deviceId, childId],
  );
  return r.rows[0];
}

export async function insertDenied(db, { id, familyId, deviceId, childId = null, reason }) {
  const r = await db.query(
    `INSERT INTO turns (id, family_id, device_id, child_id, status, denied_reason, ended_at)
     VALUES ($1, $2, $3, $4, 'denied', $5, now()) RETURNING ${COLUMNS}`,
    [id, familyId, deviceId, childId, reason],
  );
  return r.rows[0];
}

// Only recent accepted rows reserve a credit; older ones are crash leftovers
// that sweepStale will mark abandoned.
export async function countInFlight(tx, familyId, staleAfterSec) {
  const r = await tx.query(
    `SELECT count(*)::int AS n FROM turns
     WHERE family_id = $1 AND status = 'accepted' AND ${STALE.replace('$STALE', '$2')}`,
    [familyId, staleAfterSec],
  );
  return r.rows[0].n;
}

// The status guard makes completion (and therefore the debit that follows
// it) happen at most once, whichever caller gets there first.
export async function complete(tx, id, { emotion, answerText, audioFrames, staleAfterSec }) {
  const r = await tx.query(
    `UPDATE turns SET status = 'completed', emotion = $2, answer_text = $3, audio_frames = $4, ended_at = now()
     WHERE id = $1 AND status = 'accepted' AND ${STALE.replace('$STALE', '$5')} RETURNING ${COLUMNS}`,
    [id, emotion, answerText, audioFrames, staleAfterSec],
  );
  return r.rows[0] ?? null;
}

export async function abandon(db, id, { audioFrames = null } = {}) {
  const r = await db.query(
    `UPDATE turns SET status = 'abandoned', audio_frames = COALESCE($2, audio_frames), ended_at = now()
     WHERE id = $1 AND status = 'accepted' RETURNING ${COLUMNS}`,
    [id, audioFrames],
  );
  return r.rows[0] ?? null;
}

export async function fail(db, id, { emotion = null, audioFrames = null } = {}) {
  const r = await db.query(
    `UPDATE turns SET status = 'failed', emotion = $2, audio_frames = COALESCE($3, audio_frames), ended_at = now()
     WHERE id = $1 AND status = 'accepted' RETURNING ${COLUMNS}`,
    [id, emotion, audioFrames],
  );
  return r.rows[0] ?? null;
}

export async function sweepStale(db, staleAfterSec) {
  const r = await db.query(
    `UPDATE turns SET status = 'abandoned', ended_at = now()
     WHERE status = 'accepted' AND started_at <= now() - ($1::int * interval '1 second')`,
    [staleAfterSec],
  );
  return r.rowCount;
}

export async function findById(db, id) {
  const r = await db.query(`SELECT ${COLUMNS} FROM turns WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

export async function listForFamily(db, familyId, limit = 50) {
  const r = await db.query(
    `SELECT t.id, t.conversation_id, t.status, t.denied_reason, t.emotion, t.answer_text, t.audio_frames,
            t.device_id, d.serial AS device_serial, t.child_id, c.name AS child_name, t.started_at, t.ended_at
     FROM turns t
     LEFT JOIN devices d ON d.id = t.device_id
     LEFT JOIN children c ON c.id = t.child_id
     WHERE t.family_id = $1 ORDER BY t.started_at DESC, t.id LIMIT $2`,
    [familyId, limit],
  );
  return r.rows;
}

export function toDto(row) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    status: row.status,
    denied_reason: row.denied_reason,
    emotion: row.emotion,
    answer_text: row.answer_text,
    audio_frames: row.audio_frames,
    device_id: row.device_id,
    device_serial: row.device_serial ?? null,
    child_id: row.child_id,
    child_name: row.child_name ?? null,
    started_at: row.started_at,
    ended_at: row.ended_at,
  };
}
