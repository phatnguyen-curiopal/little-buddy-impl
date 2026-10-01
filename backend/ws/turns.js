import WebSocket from 'ws';
import config from '../config.js';
import * as turns from '../turns/service.js';
import { brainDeadlineMs } from '../turns/deadline.js';
import { pipeline } from '../pipeline/index.js';
import { denialFor, failedAnswer, DEFAULT_LANGUAGE } from '../gate/ask_gate.js';
import log from '../lib/log.js';

// The turn protocol on an open /v1/stream socket. Per-socket state lives on
// ws.turn; the business rules live in turns/service.js. Everything sent to
// the toy goes through safeSend, and every handler checks the socket is
// still OPEN first: ws keeps delivering frames while a close is in flight.

// PCM16 mono 16 kHz: 32000 bytes a second, 640 bytes a 20 ms frame.
export const BYTES_PER_SEC = 32000;
export const FRAME_BYTES = 640;
export const TEXT_MAX = 2000;
// Downlink audio goes out in slices so one message stays well under any
// client's frame limit (and the toy's RAM).
export const AUDIO_CHUNK_BYTES = 32000;

const maxTurnBytes = () => config.turnMaxSec * BYTES_PER_SEC;

export function safeSend(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function sendAudio(ws, turnId, audio, rate) {
  if (ws.readyState !== WebSocket.OPEN) return;
  safeSend(ws, { type: 'audio', turn_id: turnId, rate, bytes: audio.length });
  for (let off = 0; off < audio.length; off += AUDIO_CHUNK_BYTES) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(audio.subarray(off, off + AUDIO_CHUNK_BYTES), { binary: true });
  }
  safeSend(ws, { type: 'audio_end', turn_id: turnId });
}

function framesOf(t) {
  return Math.floor(t.bytes / FRAME_BYTES);
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
// status guard in the store makes a racing writer harmless. The abort comes
// before the closing check: a turn waiting on the brain is closing, and it
// is exactly the one whose brain call must stop now. Its onEnd then sees
// the abort and abandons the turn itself.
export function abandonSocket(ws, why) {
  const t = takeTurn(ws);
  if (!t) return;
  t.controller?.abort();
  if (t.pending || t.closing) return;
  log.info('turn_abandoned', { turn_id: t.id, why });
  turns.abandonTurn({ turnId: t.id, audioFrames: framesOf(t) }).catch((err) =>
    log.warn('turn_abandon_failed', { turn_id: t.id, err_message: err.message }),
  );
}

// Audio is kept only while a turn is listening: frames before turn_accepted
// or after turn_end are dropped. Odd-length frames would split a sample and
// are ignored; past TURN_MAX_SEC of audio the rest is dropped.
export function handleBinary(ws, data) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const t = ws.turn;
  if (!t || t.pending || t.closing || !data?.length) return;
  if (data.length % 2 !== 0) return;
  const room = maxTurnBytes() - t.bytes;
  if (room <= 0) return;
  const chunk = data.length > room ? data.subarray(0, room) : data;
  t.chunks.push(chunk);
  t.bytes += chunk.length;
}

export async function handleText(ws, msg) {
  if (ws.readyState !== WebSocket.OPEN) return;
  switch (msg?.type) {
    case 'turn_start':
      return onStart(ws);
    case 'turn_end':
      return onEnd(ws, msg);
    case 'turn_cancel':
      return onCancel(ws, 'cancelled');
    case 'conversation_new':
      return onConversationNew(ws);
    default:
      return undefined;
  }
}

async function onStart(ws) {
  if (ws.turn) return safeSend(ws, { type: 'error', code: 'turn_in_flight' });
  // Placeholder so a second press during the gate check is refused too.
  ws.turn = { pending: true, bytes: 0 };

  let result;
  try {
    result = await turns.startTurn({ deviceId: ws.device.id });
  } catch (err) {
    // The child path never errors: a server failure looks like break time.
    ws.turn = null;
    log.error('turn_start_failed', { device_id: ws.device.id, err_message: err.message });
    return safeSend(ws, { type: 'turn_denied', ...denialFor('disabled', ws.language), conversation_open: false });
  }
  ws.language = result.language ?? ws.language;

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
    deviceId: ws.device.id,
    childId: result.childId ?? null,
    language: result.language ?? DEFAULT_LANGUAGE,
    chunks: [],
    bytes: 0,
    closing: false,
    startedAt: Date.now(),
    controller: new AbortController(),
    timer: setTimeout(() => onCancel(ws, 'timeout'), config.turnMaxSec * 1000),
  };
  return safeSend(ws, { type: 'turn_accepted', turn_id: result.turnId, emotion: 'listening' });
}

// A typed turn carries its text on turn_end; any audio sent in that turn is
// ignored. Bad text leaves the turn open, so the client can resend or
// cancel.
function textOf(msg) {
  if (msg.text === undefined || msg.text === null) return { text: null };
  if (typeof msg.text !== 'string') return { bad: true };
  const text = msg.text.trim();
  if (!text || text.length > TEXT_MAX) return { bad: true };
  return { text };
}

async function onEnd(ws, msg) {
  const t = ws.turn;
  if (!t || t.pending || t.closing) return safeSend(ws, { type: 'error', code: 'no_turn' });
  const { text, bad } = textOf(msg);
  if (bad) return safeSend(ws, { type: 'error', code: 'invalid_text' });
  // From here the socket-close path leaves this turn to us.
  t.closing = true;
  clearTimeout(t.timer);
  const audio = text === null ? Buffer.concat(t.chunks, t.bytes) : null;
  t.chunks = [];
  // A typed turn ignores its audio, so it records none.
  const frames = text === null ? framesOf(t) : 0;
  const aborted = t.controller.signal;
  const deadline = brainDeadlineMs({
    startedAt: t.startedAt,
    now: Date.now(),
    staleAfterSec: turns.staleAfterSec(),
    brainTimeoutMs: config.brainTimeoutMs,
  });

  let answer;
  try {
    answer = await pipeline.answerTurn({
      turn: t,
      audio,
      text,
      signal: AbortSignal.any([aborted, AbortSignal.timeout(deadline)]),
    });
  } catch (err) {
    if (ws.turn === t) ws.turn = null;
    // Kill switch or socket close: nobody is listening, and nothing broke.
    if (aborted.aborted) {
      log.info('turn_abandoned', { turn_id: t.id, why: 'aborted' });
      await turns.abandonTurn({ turnId: t.id, audioFrames: frames });
      return undefined;
    }
    // A brain error is a code by construction; anything else is our own
    // failure (a store error, a bug), whose message holds no child's words.
    const brainError = err.name === 'BrainError';
    log.error('pipeline_failed', {
      turn_id: t.id,
      code: brainError ? err.code : 'internal',
      kind: brainError ? err.kind ?? undefined : undefined,
      err_message: brainError ? undefined : err.message,
    });
    const fallback = failedAnswer(t.language);
    await turns.failTurn({ turnId: t.id, emotion: fallback.emotion, audioFrames: frames });
    safeSend(ws, { type: 'answer', turn_id: t.id, ...fallback, heard: text ?? '' });
    return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: 'failed' });
  }

  // Blocked or closed while the answer was on its way back: say nothing,
  // charge nothing.
  if (aborted.aborted || ws.readyState !== WebSocket.OPEN) {
    if (ws.turn === t) ws.turn = null;
    await turns.abandonTurn({ turnId: t.id, audioFrames: frames });
    return undefined;
  }

  // Answer (and its audio) first, then charge: a family must never pay for
  // silence.
  safeSend(ws, { type: 'answer', turn_id: t.id, emotion: answer.emotion, say: answer.say, heard: answer.heard ?? '' });
  if (answer.audio?.length) sendAudio(ws, t.id, answer.audio, answer.rate ?? 16000);
  if (ws.turn === t) ws.turn = null;

  // The brain heard nothing usable and said so; that is not an answer.
  if (answer.noSpeech) {
    await turns.abandonTurn({ turnId: t.id, audioFrames: frames });
    return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: 'abandoned' });
  }
  if (ws.readyState !== WebSocket.OPEN) {
    await turns.abandonTurn({ turnId: t.id, audioFrames: frames });
    return undefined;
  }
  const { completed } = await turns.completeTurn({
    turnId: t.id,
    familyId: t.familyId,
    emotion: answer.emotion,
    answerText: answer.say,
    audioFrames: frames,
  });
  if (!completed) log.warn('turn_complete_missed', { turn_id: t.id });
  return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: completed ? 'completed' : 'abandoned' });
}

async function onCancel(ws, why) {
  const t = ws.turn;
  if (!t || t.pending || t.closing) return safeSend(ws, { type: 'error', code: 'no_turn' });
  takeTurn(ws);
  log.info('turn_abandoned', { turn_id: t.id, why });
  await turns.abandonTurn({ turnId: t.id, audioFrames: framesOf(t) });
  return safeSend(ws, { type: 'turn_done', turn_id: t.id, status: 'abandoned' });
}

// Refused while a turn is open, so the turn in flight cannot land in a
// conversation that was just ended under it.
async function onConversationNew(ws) {
  if (ws.turn) return safeSend(ws, { type: 'error', code: 'turn_in_flight' });
  await turns.endConversation({ deviceId: ws.device.id });
  return safeSend(ws, { type: 'conversation_started' });
}
