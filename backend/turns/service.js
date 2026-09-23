import { randomUUID } from 'node:crypto';
import config from '../config.js';
import { pool, withTransaction } from '../store/db.js';
import * as families from '../store/family.js';
import * as ledger from '../store/ledger.js';
import * as conversations from '../store/conversation.js';
import * as turns from '../store/turn.js';
import * as registry from '../devices/registry.js';
import { checkTurn, denialFor } from '../gate/ask_gate.js';
import log from '../lib/log.js';

// A turn is one button press. Admission reserves one credit by writing an
// 'accepted' row under the family lock; completion writes the debit exactly
// once; anything else releases the reservation without charging.

// Accepted rows older than this are crash leftovers: they neither reserve a
// credit nor can they still be completed.
const staleAfterSec = () => config.turnMaxSec + 60;

function denied(reason) {
  return { ok: false, reason, ...denialFor(reason) };
}

export async function startTurn({ deviceId }) {
  // Fresh read on purpose: ws.device is the status at upgrade time, and a
  // pause or unpair since then must be seen on this very press.
  const device = await registry.getById(deviceId);

  if (!device || device.status !== 'active' || !device.family_id) {
    const verdict = checkTurn({ device });
    const reason = verdict.ok ? 'disabled' : verdict.reason;
    // An unclaimed toy has no family to show a denied turn to, and any
    // provisioned toy could grow the table without bound, so only log it.
    if (device?.family_id && reason !== 'not_claimed') {
      await turns.insertDenied(pool, { id: randomUUID(), familyId: device.family_id, deviceId, childId: device.child_id, reason });
    }
    log.info('turn_denied', { device_id: deviceId, reason });
    return denied(reason);
  }

  return withTransaction(async (tx) => {
    await families.lockForUpdate(tx, device.family_id);
    const [balance, inflight] = await Promise.all([
      ledger.balance(tx, device.family_id),
      turns.countInFlight(tx, device.family_id, staleAfterSec()),
    ]);
    const verdict = checkTurn({ device, balance, inflight });
    if (!verdict.ok) {
      await turns.insertDenied(tx, { id: randomUUID(), familyId: device.family_id, deviceId, childId: device.child_id, reason: verdict.reason });
      log.info('turn_denied', { device_id: deviceId, reason: verdict.reason });
      return denied(verdict.reason);
    }

    let conversation = await conversations.findOpenForDevice(tx, deviceId, device.family_id, config.conversationIdleSec);
    if (conversation) await conversations.touch(tx, conversation.id);
    else conversation = await conversations.insert(tx, { familyId: device.family_id, deviceId, childId: device.child_id });

    const turn = await turns.insertAccepted(tx, {
      id: randomUUID(),
      conversationId: conversation.id,
      familyId: device.family_id,
      deviceId,
      childId: device.child_id,
    });
    log.info('turn_accepted', { device_id: deviceId, turn_id: turn.id, conversation_id: conversation.id });
    return { ok: true, turnId: turn.id, conversationId: conversation.id, familyId: device.family_id, childId: device.child_id };
  });
}

// The debit rides in the same transaction as the completion, and the
// completion only happens once (status guard), so the family is charged
// exactly once per answered turn no matter how many callers race here.
export async function completeTurn({ turnId, familyId, emotion, answerText, audioFrames }) {
  return withTransaction(async (tx) => {
    const row = await turns.complete(tx, turnId, { emotion, answerText, audioFrames, staleAfterSec: staleAfterSec() });
    if (!row) return { completed: false, debited: false };
    const debited = await ledger.insertDebit(tx, { familyId, turnId, actorId: row.device_id });
    return { completed: true, debited };
  });
}

export async function abandonTurn({ turnId, audioFrames = null }) {
  return turns.abandon(pool, turnId, { audioFrames });
}

export async function failTurn({ turnId, emotion = null, audioFrames = null }) {
  return turns.fail(pool, turnId, { emotion, audioFrames });
}

export async function sweepStale() {
  const n = await turns.sweepStale(pool, staleAfterSec());
  if (n) log.warn('turns_swept', { count: n });
  return n;
}

export async function listForFamily(familyId, limit = 50) {
  const rows = await turns.listForFamily(pool, familyId, limit);
  return rows.map(turns.toDto);
}
