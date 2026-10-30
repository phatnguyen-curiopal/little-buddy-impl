import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api, hasSession, onSessionChange } from '../lib/api.js';
import { signRequest } from './signing.js';
import { canSend, initialState, reconnectPlan, reduce, streamUrl, tapAction } from './machine.js';
import { TURN_CAP_MS, startCapture } from './mic.js';
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
// - /v1/time is asked before every connect instead of trusting the clock.
//
// Socket, mic, player and timers live in a ref (they must survive renders
// and be torn down exactly once); what the screen shows comes from the
// pure reducer in machine.js.

const secrets = new Map();
onSessionChange(() => {
  if (!hasSession()) secrets.clear();
});

// The child often starts talking on the tap, before turn_accepted arrives;
// frames are held (up to one second) and sent once the turn is accepted,
// since the server drops audio that arrives earlier.
const PRE_ACCEPT_FRAMES = 50;
const MAX_TEXT = 2000;

const nowSec = () => Math.floor(Date.now() / 1000);

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
    ref.current = {
      gen: 0, ws: null, timer: null, capTimer: null, attempts: 0, rerevealed: false, offset: 0,
      capture: null, captureToken: 0, accepted: false, pre: [], endOnAccept: false, cancelOnAccept: false,
      pendingText: null, turnId: null, audioOn: false, levelFns: new Set(), player: null,
    };
    ref.current.player = createPlayer({ onEnded: () => dispatch({ type: 'playback_end' }) });
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

  const stopCapture = useCallback(() => {
    clearTimeout(r.capTimer);
    r.capTimer = null;
    r.captureToken += 1;
    r.capture?.stop();
    r.capture = null;
    emitLevel(0);
  }, [r, emitLevel]);

  // Everything about the child's side of a turn, but not the playback:
  // turn_done can arrive while Buddy's last words are still playing.
  const clearTurn = useCallback(() => {
    stopCapture();
    r.accepted = false;
    r.pre = [];
    r.endOnAccept = false;
    r.cancelOnAccept = false;
    r.pendingText = null;
    r.turnId = null;
  }, [r, stopCapture]);

  const resetTurn = useCallback(() => {
    clearTurn();
    r.audioOn = false;
  }, [r, clearTurn]);

  // ---- connection -------------------------------------------------------

  const connectRef = useRef(null);

  // The server's turn clock starts at turn_accepted, while the mic's own
  // cap counts audio frames, which start late if the browser is still
  // asking for permission. This timer ends the turn on the server's clock.
  const armCap = useCallback((turnId) => {
    clearTimeout(r.capTimer);
    r.capTimer = setTimeout(() => {
      r.capTimer = null;
      if (r.turnId !== turnId || stateRef.current.status !== 'listening') return;
      stopCapture();
      send({ type: 'turn_end' });
      dispatch({ type: 'end' });
    }, TURN_CAP_MS);
  }, [r, send, stopCapture]);

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
        dispatch({ type: 'denied', emotion: msg.emotion, say: msg.say });
        callbacks.current.onSettled?.(msg);
        break;
      case 'answer':
        stopCapture();
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
        // runs from turn_accepted); the mic must close with it, or frames
        // and a late turn_end would go to a turn that no longer exists.
        if (msg.turn_id === r.turnId) clearTurn();
        dispatch({ type: 'turn_done', turn_id: msg.turn_id, status: msg.status });
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
  }, [r, send, resetTurn, clearTurn, stopCapture, armCap]);

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
      if (ev.code === 4003) {
        // Paused or revoked while connected: the sleepy face, and no retry
        // loop; the toy comes back when the dashboard says it is awake.
        dispatch({ type: 'closed', code: 4003 });
        callbacks.current.onBlocked?.();
        return;
      }
      recover(gen);
    };
  }, [r, deviceId, onMessage, recover, resetTurn]);
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
      r.player.stop();
      const ws = r.ws;
      r.ws = null;
      ws?.close(1000, 'leaving');
    };
  }, [deviceId, enabled, r, connect, resetTurn]);

  useEffect(() => () => r.player.close(), [r]);

  // ---- what the child does ---------------------------------------------

  const endVoice = useCallback(() => {
    stopCapture();
    if (!r.accepted) {
      r.endOnAccept = true;
      return;
    }
    send({ type: 'turn_end' });
    dispatch({ type: 'end' });
  }, [r, send, stopCapture]);

  const cancelVoice = useCallback((error) => {
    stopCapture();
    r.pre = [];
    if (r.accepted) send({ type: 'turn_cancel' });
    else r.cancelOnAccept = true;
    dispatch({ type: 'cancel', error });
  }, [r, send, stopCapture]);

  const startVoice = useCallback(() => {
    if (!send({ type: 'turn_start' })) return;
    resetTurn();
    dispatch({ type: 'start', mode: 'voice' });
    const token = r.captureToken;
    startCapture({
      onFrame: (frame) => {
        if (token !== r.captureToken) return;
        if (r.accepted) send(frame);
        else {
          r.pre.push(frame);
          if (r.pre.length > PRE_ACCEPT_FRAMES) r.pre.shift();
        }
      },
      onLevel: (level) => {
        if (token === r.captureToken) emitLevel(level);
      },
      onEvent: (what) => {
        if (token !== r.captureToken) return;
        if (what === 'speech') dispatch({ type: 'speech' });
        else if (what === 'no_speech') cancelVoice('no_speech');
        else endVoice();
      },
    }).then((capture) => {
      if (token === r.captureToken) r.capture = capture;
      else capture.stop();
    }).catch((err) => {
      if (token === r.captureToken) cancelVoice(err.code || 'mic_unavailable');
    });
  }, [r, send, resetTurn, emitLevel, endVoice, cancelVoice]);

  const tap = useCallback(() => {
    const action = tapAction(stateRef.current);
    if (!action) return;
    r.player.unlock();
    if (action === 'end') {
      endVoice();
      return;
    }
    if (action === 'interrupt') {
      r.player.stop();
      dispatch({ type: 'playback_end' });
    }
    startVoice();
  }, [r, endVoice, startVoice]);

  const sendText = useCallback((text) => {
    const clean = String(text ?? '').trim().slice(0, MAX_TEXT);
    const current = stateRef.current;
    if (!clean || !canSend(current)) return false;
    r.player.unlock();
    if (current.playing) {
      r.player.stop();
      dispatch({ type: 'playback_end' });
    }
    if (!send({ type: 'turn_start' })) return false;
    resetTurn();
    r.pendingText = clean;
    dispatch({ type: 'start', mode: 'text', text: clean });
    return true;
  }, [r, send, resetTurn]);

  const newConversation = useCallback(() => {
    if (!canSend(stateRef.current)) return false;
    return send({ type: 'conversation_new' });
  }, [send]);

  const reconnect = useCallback(() => {
    if (!enabled) return;
    r.gen += 1;
    r.attempts = 0;
    r.rerevealed = false;
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
