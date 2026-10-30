import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api, hasSession, onSessionChange } from '../lib/api.js';
import { signRequest } from './signing.js';
import { canSend, initialState, reconnectPlan, reduce, streamUrl, tapAction } from './machine.js';
import { TURN_CAP_MS, micSupported, startCapture } from './mic.js';
import { createVad } from './vad.js';
import { createPlayer } from './player.js';

// The browser playing the toy. It speaks the device protocol exactly as
// firmware does (HMAC-signed /v1/stream, turn_start, PCM frames, turn_end),
// so the gate, the credits and the conversation rules are the real ones.
//
// Deliberate differences from a physical toy:
// - no heartbeat: the toy's last-seen time and firmware version on the
//   dashboard stay the physical toy's own;
// - the secret comes from the owner-only reveal endpoint, is kept in memory
//   for this page session only, and is forgotten on sign-out;
// - /v1/time is asked before every connect instead of trusting the clock;
// - hands-free: the mic opens as soon as the stream is ready and stays
//   open. A turn starts when the child starts talking (turn_start, with the
//   frames just before so the first syllable is kept) and ends once they
//   have been quiet for SILENCE_MS. While Buddy thinks and talks the mic is
//   ignored, and for a moment after, so its own voice never starts a turn.
//   The big button mutes, sends now, or interrupts.
//
// Socket, mic, player and timers live in a ref (they must survive renders
// and be torn down exactly once); what the screen shows comes from the
// pure reducer in machine.js.

const secrets = new Map();
onSessionChange(() => {
  if (!hasSession()) secrets.clear();
});

// The turn ends after this much quiet following the child's words: two
// seconds, long enough for a breath between sentences, short enough that
// the answer feels like a reply.
export const SILENCE_MS = 2000;
// Frames kept from just before speech was confirmed (300 ms), so the first
// syllable is not lost.
const PRE_ROLL_FRAMES = 15;
// The server drops audio that arrives before turn_accepted; frames are held
// until then, up to 1.5 s with the pre-roll included.
const PRE_ACCEPT_FRAMES = 75;
// After Buddy's voice, or an interruption, this much is ignored before
// listening again, so the tail of the playback is never taken for speech.
const COOLDOWN_MS = 500;
const MAX_TEXT = 2000;

const nowSec = () => Math.floor(Date.now() / 1000);

// Listening again after a turn: forget the utterance, keep what the
// detector knows about the room, and skip a moment.
function rearm(r) {
  r.vad?.reset();
  r.roll = [];
  r.quietUntil = performance.now() + COOLDOWN_MS;
}

// The signer needs SubtleCrypto, which browsers expose only in a secure
// context (https or localhost). On a plain-http LAN address nothing can be
// signed, so the page says so up front instead of revealing the secret for
// a connection that cannot happen.
export function webToySupported() {
  return typeof window !== 'undefined' && window.isSecureContext === true && Boolean(globalThis.crypto?.subtle);
}

// onSettled: a turn finished or was refused, so the dashboard's balance and
// activity may have changed. onBlocked: the toy was paused or revoked.
export function useWebToy(deviceId, { enabled, onSettled, onBlocked } = {}) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const callbacks = useRef({});
  callbacks.current = { onSettled, onBlocked };

  const ref = useRef(null);
  if (!ref.current) {
    const r = {
      gen: 0, ws: null, timer: null, capTimer: null, attempts: 0, rerevealed: false, offset: 0,
      // The mic: wanted unless the child muted it or it could not open.
      capture: null, micToken: 0, micState: 'off', wantMic: micSupported(), vad: null, roll: [], quietUntil: 0,
      // The open turn, if any.
      turnPending: false, accepted: false, ended: false, pre: [], endOnAccept: false, cancelOnAccept: false, pendingText: null, turnId: null,
      audioOn: false, levelFns: new Set(), player: null,
    };
    r.player = createPlayer({
      onEnded: () => {
        dispatch({ type: 'playback_end' });
        rearm(r);
      },
    });
    ref.current = r;
  }
  const r = ref.current;

  const emitLevel = useCallback((level) => {
    for (const fn of r.levelFns) fn(level);
  }, [r]);

  const send = useCallback((payload) => {
    if (r.ws?.readyState !== WebSocket.OPEN) return false;
    r.ws.send(typeof payload === 'string' || payload instanceof ArrayBuffer ? payload : JSON.stringify(payload));
    return true;
  }, [r]);

  // ---- the mic ----------------------------------------------------------

  const closeMic = useCallback((error) => {
    r.micToken += 1;
    r.micState = 'off';
    r.capture?.stop();
    r.capture = null;
    r.vad = null;
    r.roll = [];
    emitLevel(0);
    dispatch({ type: 'mic_off', error });
  }, [r, emitLevel]);

  // Everything about the child's side of a turn, but not the mic and not
  // the playback: turn_done can arrive while Buddy's last words still play.
  const clearTurn = useCallback(() => {
    clearTimeout(r.capTimer);
    r.capTimer = null;
    r.turnPending = false;
    r.accepted = false;
    r.ended = false;
    r.pre = [];
    r.endOnAccept = false;
    r.cancelOnAccept = false;
    r.pendingText = null;
    r.turnId = null;
  }, [r]);

  const resetTurn = useCallback(() => {
    clearTurn();
    r.audioOn = false;
  }, [r, clearTurn]);

  const endVoice = useCallback(() => {
    if (!r.turnPending || r.ended) return;
    r.ended = true;
    if (!r.accepted) {
      r.endOnAccept = true;
      return;
    }
    send({ type: 'turn_end' });
    dispatch({ type: 'end' });
  }, [r, send]);

  // Speech confirmed between turns: the turn opens with the pre-roll.
  const beginTurn = useCallback(() => {
    if (r.turnPending) return;
    if (!send({ type: 'turn_start' })) {
      r.vad?.reset();
      return;
    }
    clearTurn();
    r.turnPending = true;
    r.pre = r.roll;
    r.roll = [];
    dispatch({ type: 'start', mode: 'voice', heard: true });
  }, [r, send, clearTurn]);

  const onFrame = useCallback((frame, rms) => {
    if (r.turnPending) {
      if (r.ended) return;
      if (r.accepted) send(frame);
      else {
        r.pre.push(frame);
        if (r.pre.length > PRE_ACCEPT_FRAMES) r.pre.shift();
      }
      if (r.vad?.push(rms) === 'end') endVoice();
      return;
    }
    // Between turns: only while the toy is free, and never in the moment
    // after its own voice.
    const { status } = stateRef.current;
    if ((status !== 'idle' && status !== 'denied') || performance.now() < r.quietUntil) return;
    r.roll.push(frame);
    if (r.roll.length > PRE_ROLL_FRAMES) r.roll.shift();
    const verdict = r.vad?.push(rms);
    if (verdict === 'speech') beginTurn();
    else if (verdict) r.vad.reset();
  }, [r, send, endVoice, beginTurn]);

  const openMic = useCallback(() => {
    if (r.micState !== 'off') return;
    r.micState = 'opening';
    r.micToken += 1;
    const token = r.micToken;
    dispatch({ type: 'mic_opening' });
    startCapture({
      onFrame: (frame, rms) => {
        if (token === r.micToken) onFrame(frame, rms);
      },
      onLevel: (level) => {
        if (token === r.micToken) emitLevel(level);
      },
    }).then((capture) => {
      if (token !== r.micToken) {
        capture.stop();
        return;
      }
      r.capture = capture;
      r.micState = 'on';
      r.vad = createVad({ silenceMs: SILENCE_MS, noSpeechMs: Infinity });
      r.roll = [];
      r.quietUntil = 0;
      // Permission was just granted on a gesture: the best moment to make
      // sure Buddy's voice can play.
      r.player.unlock();
      dispatch({ type: 'mic_on' });
    }).catch((err) => {
      if (token !== r.micToken) return;
      r.micState = 'off';
      r.wantMic = false;
      dispatch({ type: 'mic_off', error: err.code || 'mic_unavailable' });
    });
  }, [r, onFrame, emitLevel]);

  // ---- connection -------------------------------------------------------

  const connectRef = useRef(null);

  // The server's turn clock starts at turn_accepted; this timer ends the
  // turn on that clock before the server abandons it.
  const armCap = useCallback((turnId) => {
    clearTimeout(r.capTimer);
    r.capTimer = setTimeout(() => {
      r.capTimer = null;
      if (r.turnId === turnId) endVoice();
    }, TURN_CAP_MS);
  }, [r, endVoice]);

  const recover = useCallback((gen) => {
    const plan = reconnectPlan({ attempts: r.attempts, rerevealed: r.rerevealed });
    if (plan.action === 'retry') {
      r.attempts += 1;
      dispatch({ type: 'connecting' });
      clearTimeout(r.timer);
      r.timer = setTimeout(() => connectRef.current(gen), plan.delayMs);
    } else if (plan.action === 'reveal') {
      // Three failures in a row: the secret may have been rotated. Ask
      // for it once more and connect once; attempts stays at the limit so
      // a failure after the reveal gives up instead of retrying again.
      r.rerevealed = true;
      secrets.delete(deviceId);
      connectRef.current(gen);
    } else {
      dispatch({ type: 'offline', error: 'stream_failed' });
    }
  }, [r, deviceId]);

  const onMessage = useCallback((data) => {
    if (data instanceof ArrayBuffer) {
      if (r.audioOn) r.player.push(data);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        // A good connection earns a fresh budget, reveal included, for the
        // next drop in this session.
        r.attempts = 0;
        r.rerevealed = false;
        dispatch({ type: 'ready' });
        rearm(r);
        if (r.wantMic) openMic();
        break;
      case 'turn_accepted':
        r.turnId = msg.turn_id;
        r.accepted = true;
        if (r.pendingText !== null) {
          send({ type: 'turn_end', text: r.pendingText });
          r.pendingText = null;
        } else if (r.cancelOnAccept) {
          send({ type: 'turn_cancel' });
        } else {
          for (const frame of r.pre) send(frame);
          r.pre = [];
          if (r.endOnAccept) send({ type: 'turn_end' });
          else armCap(msg.turn_id);
        }
        dispatch({ type: 'accepted', turn_id: msg.turn_id });
        if (r.endOnAccept) dispatch({ type: 'end' });
        break;
      case 'turn_denied':
        resetTurn();
        r.wantMic = false;
        closeMic();
        dispatch({ type: 'denied', emotion: msg.emotion, say: msg.say });
        callbacks.current.onSettled?.(msg);
        break;
      case 'answer':
        dispatch({ type: 'answer', turn_id: msg.turn_id, emotion: msg.emotion, say: msg.say, heard: msg.heard });
        break;
      case 'audio':
        if (msg.turn_id !== r.turnId) break;
        r.audioOn = true;
        r.player.begin(msg.rate);
        dispatch({ type: 'audio', turn_id: msg.turn_id });
        break;
      case 'audio_end':
        if (!r.audioOn) break;
        r.audioOn = false;
        r.player.finish();
        break;
      case 'turn_done':
        // The server can close a turn on its own (its TURN_MAX_SEC timer
        // runs from turn_accepted); the turn must close with it, or frames
        // and a late turn_end would go to a turn that no longer exists.
        if (msg.turn_id === r.turnId) clearTurn();
        dispatch({ type: 'turn_done', turn_id: msg.turn_id, status: msg.status });
        if (!r.player.playing) rearm(r);
        callbacks.current.onSettled?.(msg);
        break;
      case 'conversation_started':
        dispatch({ type: 'conversation_started' });
        break;
      case 'error':
        dispatch({ type: 'error', code: msg.code });
        break;
      default:
        break;
    }
  }, [r, send, resetTurn, clearTurn, armCap, closeMic, openMic]);

  const connect = useCallback(async (gen) => {
    if (gen !== r.gen) return;
    dispatch({ type: 'connecting' });

    if (!webToySupported()) {
      dispatch({ type: 'offline', error: 'insecure' });
      return;
    }

    let secret = secrets.get(deviceId);
    if (!secret) {
      try {
        const out = await api.revealSecret(deviceId);
        secret = out.secret_hex;
        secrets.set(deviceId, secret);
      } catch (err) {
        if (gen !== r.gen) return;
        // 404: not this family's, or no longer awake. Refresh what the
        // dashboard knows rather than retrying a request that cannot pass.
        if (err.status === 404) {
          dispatch({ type: 'asleep' });
          callbacks.current.onBlocked?.();
        } else if (err.status === 403 || err.status === 401 || err.status === 429) {
          dispatch({ type: 'offline', error: err.code });
        } else {
          recover(gen);
        }
        return;
      }
    }

    // The signature's timestamp must be within the server's window, and a
    // laptop clock can be minutes off; the server's own time is the fix.
    try {
      const res = await fetch('/v1/time', { cache: 'no-store' });
      const body = await res.json();
      if (!Number.isInteger(body?.server_time)) throw new Error('bad time');
      r.offset = body.server_time - nowSec();
    } catch {
      if (gen === r.gen) recover(gen);
      return;
    }
    if (gen !== r.gen) return;

    let signed;
    try {
      signed = await signRequest({ secretHex: secret, deviceId, method: 'GET', path: '/v1/stream', ts: nowSec() + r.offset });
    } catch {
      secrets.delete(deviceId);
      dispatch({ type: 'offline', error: 'stream_failed' });
      return;
    }
    if (gen !== r.gen) return;

    const ws = new WebSocket(streamUrl(window.location.origin, signed.query));
    ws.binaryType = 'arraybuffer';
    r.ws = ws;
    ws.onmessage = (ev) => {
      if (gen === r.gen) onMessage(ev.data);
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (gen !== r.gen) return;
      r.ws = null;
      resetTurn();
      r.player.stop();
      // The mic is released with the socket and reopened on the next ready,
      // so the browser's recording light only shows while words can go out.
      closeMic();
      if (ev.code === 4003) {
        // Paused or revoked while connected: the sleepy face, and no retry
        // loop; the toy comes back when the dashboard says it is awake.
        dispatch({ type: 'closed', code: 4003 });
        callbacks.current.onBlocked?.();
        return;
      }
      recover(gen);
    };
  }, [r, deviceId, onMessage, recover, resetTurn, closeMic]);
  connectRef.current = connect;

  useEffect(() => {
    if (!deviceId) return undefined;
    if (!enabled) {
      dispatch({ type: 'asleep' });
      return undefined;
    }
    r.gen += 1;
    r.attempts = 0;
    r.rerevealed = false;
    connect(r.gen);
    return () => {
      r.gen += 1;
      clearTimeout(r.timer);
      resetTurn();
      closeMic();
      r.player.stop();
      const ws = r.ws;
      r.ws = null;
      ws?.close(1000, 'leaving');
    };
  }, [deviceId, enabled, r, connect, resetTurn, closeMic]);

  // Browsers only let a page play sound after a gesture. Hands-free there
  // may be none before Buddy's first words, so the first tap or key
  // anywhere on the page unlocks the player.
  useEffect(() => {
    const unlock = () => r.player.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [r]);

  useEffect(() => () => r.player.close(), [r]);

  // ---- what the child does ---------------------------------------------

  const tap = useCallback(() => {
    const action = tapAction(stateRef.current);
    r.player.unlock();
    if (action === 'mute') {
      r.wantMic = false;
      closeMic();
    } else if (action === 'listen') {
      r.wantMic = true;
      openMic();
    } else if (action === 'end') {
      endVoice();
    } else if (action === 'interrupt') {
      r.player.stop();
      dispatch({ type: 'playback_end' });
      rearm(r);
    }
  }, [r, closeMic, openMic, endVoice]);

  const sendText = useCallback((text) => {
    const clean = String(text ?? '').trim().slice(0, MAX_TEXT);
    const current = stateRef.current;
    if (!clean || !canSend(current) || r.turnPending) return false;
    r.player.unlock();
    if (current.playing) {
      r.player.stop();
      dispatch({ type: 'playback_end' });
      rearm(r);
    }
    if (!send({ type: 'turn_start' })) return false;
    clearTurn();
    r.turnPending = true;
    // No audio goes with a typed turn: the mic's frames are dropped.
    r.ended = true;
    r.pendingText = clean;
    dispatch({ type: 'start', mode: 'text', text: clean });
    return true;
  }, [r, send, clearTurn]);

  const newConversation = useCallback(() => {
    if (!canSend(stateRef.current) || r.turnPending) return false;
    return send({ type: 'conversation_new' });
  }, [r, send]);

  const reconnect = useCallback(() => {
    if (!enabled) return;
    r.gen += 1;
    r.attempts = 0;
    r.rerevealed = false;
    r.wantMic = micSupported();
    clearTimeout(r.timer);
    r.ws?.close(1000, 'reconnect');
    r.ws = null;
    connect(r.gen);
  }, [r, enabled, connect]);

  const onLevel = useCallback((fn) => {
    r.levelFns.add(fn);
    return () => r.levelFns.delete(fn);
  }, [r]);

  const clearError = useCallback(() => dispatch({ type: 'clear_error' }), []);

  return { state, tap, sendText, newConversation, reconnect, onLevel, clearError };
}
