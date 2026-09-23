import WebSocket from 'ws';
import config from '../config.js';
import * as turns from '../turns/service.js';
import { pipeline } from '../pipeline/index.js';
import { denialFor } from '../gate/ask_gate.js';
import log from '../lib/log.js';

// The turn protocol on an open /v1/stream socket. Per-socket state lives on
// ws.turn; the business rules live in turns/service.js. Everything sent to
// the toy goes through safeSend, and every handler checks the socket is
// still OPEN first: ws keeps delivering frames while a close is in flight.

const FAILED_ANSWER = Object.freeze({ emotion: 'confused', say: "Hmm, let's try that again in a little while." });

export function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function takeTurn(ws) {
  const t = ws.turn;
  if (!t) return null;
  clearTimeout(t.timer);
  ws.turn = null;
  return t;
}

// Synchronous on purpose: the registry's blocked hook cannot await. The
// state is cleared right away and the database write is detached; the
// status guard in the store makes a racing writer harmless.
export function abandonSocket(ws, why) {
  const t = takeTurn(ws);
  if (!t || t.pending || t.closing) return;
  log.info('turn_abandoned', { turn_id: t.id, why });
  turns.abandonTurn({ turnId: t.id, audioFrames: t.frames }).catch((err) =>
    log.warn('turn_abandon_failed', { turn_id: t.id, err_message: err.message }),
  );
}

export function handleBinary(ws) {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.turn && !ws.turn.pending && !ws.turn.closing) ws.turn.frames += 1;
}

export async function handleText(ws, msg) {
  if (ws.readyState !== WebSocket.OPEN) return;
  switch (msg?.type) {
    case 'turn_start':
      return onStart(ws);
    case 'turn_end':
      return onEnd(ws);
    case 'turn_cancel':
      return onCancel(ws, 'cancelled');
    default:
      return undefined;
  }
}

async function onStart(ws) {
  if (ws.turn) return safeSend(ws, { type: 'error', code: 'turn_in_flight' });
  // Placeholder so a second press during the gate check is refused too.
  ws.turn = { pending: true, frames: 0 };

  let result;
  try {
    result = await turns.startTurn({ deviceId: ws.device.id });
  } catch (err) {
    // The child path never errors: a server failure looks like break time.
    ws.turn = null;
    log.error('turn_start_failed', { device_id: ws.device.id, err_message: err.message });
    return safeSend(ws, { type: 'turn_denied', ...denialFor('disabled'), conversation_open: false });
  }

  if (!result.ok) {
    ws.turn = null;
    return safeSend(ws, { type: 'turn_denied', emotion: result.emotion, say: result.say, conversation_open: false });
  }
  if (ws.readyState !== WebSocket.OPEN) {
    ws.turn = null;
    await turns.abandonTurn({ turnId: result.turnId, audioFrames: 0 });
    return undefined;
  }
  ws.turn = {
    id: result.turnId,
    conversationId: result.conversationId,
    familyId: result.familyId,
    frames: 0,
    closing: false,
    timer: setTimeout(() => onCancel(ws, 'timeout'), config.turnMaxSec * 1000),
  };
  return safeSend(ws, { type: 'turn_accepted', turn_id: result.turnId, emotion: 'listening' });
}

async function onEnd(ws) {
  const t = ws.turn;
  if (!t || t.pending || t.closing) return safeSend(ws, { type: 'error', code: 'no_turn' });
  // From here the socket-close path leaves this turn to us.
  t.closing = true;
  clearTimeout(t.timer);

  let answer;
  try {
    answer = await pipeline.answerTurn({ turn: t, audioFrames: t.frames });
  } catch (err) {
    ws.turn = null;
    log.error('pipeline_failed', { turn_id: t.id, err_message: err.message });
    await turns.failTurn({ turnId: t.id, emotion: FAILED_ANSWER.emotion, audioFrames: t.frames });
    safeSend(ws, { type: 'answer', turn_id: t.id, ...FAILED_ANSWER });
    return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: 'failed' });
  }

  // Answer first, then charge: a family must never pay for silence.
  safeSend(ws, { type: 'answer', turn_id: t.id, emotion: answer.emotion, say: answer.say });
  ws.turn = null;
  if (ws.readyState !== WebSocket.OPEN) {
    await turns.abandonTurn({ turnId: t.id, audioFrames: t.frames });
    return undefined;
  }
  const { completed } = await turns.completeTurn({
    turnId: t.id,
    familyId: t.familyId,
    emotion: answer.emotion,
    answerText: answer.say,
    audioFrames: t.frames,
  });
  if (!completed) log.warn('turn_complete_missed', { turn_id: t.id });
  return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: completed ? 'completed' : 'abandoned' });
}

async function onCancel(ws, why) {
  const t = takeTurn(ws);
  if (!t || t.pending || t.closing) return safeSend(ws, { type: 'error', code: 'no_turn' });
  log.info('turn_abandoned', { turn_id: t.id, why });
  await turns.abandonTurn({ turnId: t.id, audioFrames: t.frames });
  return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: 'abandoned' });
}
