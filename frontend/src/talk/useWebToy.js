import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api, deviceSocketUrl, hasSession, onSessionChange } from '../lib/api.js';
import { signHello } from './signing.js';
import {
  canListen, canSend, cancelMessage, dueIn, helloMessage, initialState, newTurnId, reconnectPlan, reduce, stallPlan, statusMessage,
  tapAction, turnEndMessage, turnStartMessage, watch,
} from './machine.js';
import { DOWNLINK, UPLINK, decodeFrame, encodeFrame } from './dsp.js';
import { TURN_CAP_FRAMES, micSupported, startCapture } from './mic.js';
import { createVad } from './vad.js';
import { createPlayer } from './player.js';

// The browser playing a Buddy that lives in the browser. It speaks
// backend-v2's toy protocol exactly as firmware does (the signed challenge,
// turn_start, 20 ms PCM frames, turn_end), so the gate, the credits and the
// conversation rules are the real ones. docs/backend-v2.md, "A Buddy in the
// browser", is the contract.
//
// What is particular to the browser:
// - the secret comes from the owner-only credential endpoint, is kept in
//   memory for this page only, and is forgotten on sign-out;
// - hands-free: the mic opens once the toy has signed in and stays open. A
//   turn starts when the child starts talking (turn_start, then the frames
//   from just before, so the first syllable is kept) and ends once they have
//   been quiet for SILENCE_MS. While Buddy thinks and talks the mic is
//   ignored, and for a moment after, so its own voice never starts a turn.
//   The big button mutes, sends now, or interrupts;
// - the page watches each turn itself (watch in machine.js): one the server
//   never finishes is cancelled after a while, the child is told, and the
//   toy listens again, so the screen never thinks forever.
//
// Socket, mic, player and timers live in a ref (they must survive renders
// and be torn down exactly once); what the screen shows comes from the pure
// reducer in machine.js.

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
// After Buddy's voice, or an interruption, this much is ignored before
// listening again, so the tail of the playback is never taken for speech.
const COOLDOWN_MS = 500;
// No ready this long after opening the socket: something between the page
// and the voice service is stuck, so the socket goes the way of a drop.
const READY_TIMEOUT_MS = 15_000;
// A web Buddy is a toy of its own in backend-v2, and the dashboard calls a
// toy online for two minutes after it last heard from it.
const STATUS_EVERY_MS = 60_000;
const MAX_TEXT = 2000;

// Listening again after a turn: forget the utterance, keep what the
// detector knows about the room, and skip a moment.
function rearm(r) {
  r.vad?.reset();
  r.roll = [];
  r.quietUntil = performance.now() + COOLDOWN_MS;
}

// The signature needs SubtleCrypto, which browsers expose only in a secure
// context (https or localhost). On a plain-http LAN address nothing can be
// signed, so the page says so up front instead of fetching the secret for a
// connection that cannot happen.
export function webToySupported() {
  return typeof window !== 'undefined' && window.isSecureContext === true && Boolean(globalThis.crypto?.subtle) && typeof WebSocket === 'function';
}

// enabled: the toy is awake, so connecting can work. hold: something the
// screen explains stands in the way of every answer (no credits, no Buddy
// yet), so the mic stays closed; a turn already open still finishes.
// onSettled: a turn finished or was refused, so the balance and the activity
// may have changed. onBlocked: the toy was paused or removed.
export function useWebToy(deviceId, { enabled, hold = false, onSettled, onBlocked } = {}) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const callbacks = useRef({});
  callbacks.current = { onSettled, onBlocked };

  const ref = useRef(null);
  if (!ref.current) {
    const r = {
      gen: 0, ws: null, ready: false, secret: null, sampleRate: 16000,
      timer: null, readyTimer: null, statusTimer: null, attempts: 0, refetched: false, woke: false, hold: false,
      // The mic: wanted unless the child muted it or it could not open.
      capture: null, micToken: 0, micState: 'off', wantMic: micSupported(), vad: null, roll: [], quietUntil: 0,
      // The open turn, the child's or Buddy's: ended once turn_end went out
      // (Buddy's turn and a typed one have nothing to stream).
      turnId: null, turnMode: null, ended: false, seq: 0, frames: 0, audioOn: false,
      // The watchdog over it (machine.js watch), its one timer and when that
      // fires; heard counts the server's messages on this page.
      dog: null, dogTimer: null, dogAt: 0, heard: 0,
      levelFns: new Set(), player: null,
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

  // The open turn's bookkeeping, its watchdog included, but not the mic and
  // not the playback: Buddy's last words may still be playing when
  // turn_done arrives.
  const clearTurn = useCallback(() => {
    r.turnId = null;
    r.turnMode = null;
    r.ended = false;
    r.seq = 0;
    r.frames = 0;
    r.dog = null;
    clearTimeout(r.dogTimer);
    r.dogTimer = null;
  }, [r]);

  const resetTurn = useCallback(() => {
    clearTurn();
    r.audioOn = false;
  }, [r, clearTurn]);

  // Set below, once restart exists: what giving up on a turn does.
  const stallRef = useRef(null);

  // One timer for the watchdog. Every frame of Buddy's voice moves the
  // deadline later, 50 times a second, so the timer is only moved when the
  // deadline comes sooner; one that fires early sets itself for the rest.
  const armDog = useCallback(() => {
    const now = performance.now();
    const due = dueIn(r.dog, now);
    if (due === null) {
      clearTimeout(r.dogTimer);
      r.dogTimer = null;
      return;
    }
    if (r.dogTimer && r.dogAt <= now + due) return;
    clearTimeout(r.dogTimer);
    r.dogAt = now + due;
    r.dogTimer = setTimeout(() => {
      r.dogTimer = null;
      if (dueIn(r.dog, performance.now()) === 0) stallRef.current?.();
      else armDog();
    }, due);
  }, [r]);

  const guard = useCallback((event) => {
    r.dog = watch(r.dog, event, performance.now(), r.heard);
    armDog();
  }, [r, armDog]);

  const sendFrame = useCallback((pcm) => {
    if (!send(encodeFrame(r.seq, pcm, UPLINK))) return;
    r.seq = (r.seq + 1) & 0xffff;
    r.frames += 1;
  }, [r, send]);

  const endVoice = useCallback((reason) => {
    if (!r.turnId || r.turnMode !== 'voice' || r.ended) return;
    r.ended = true;
    send(turnEndMessage(r.turnId, reason));
    guard({ type: 'wait', turn_id: r.turnId });
    dispatch({ type: 'end', turn_id: r.turnId });
  }, [r, send, guard]);

  // Speech confirmed between turns: the turn opens and the pre-roll goes at
  // once (backend-v2 takes audio right behind turn_start).
  const beginTurn = useCallback(() => {
    if (r.turnId || r.hold) return;
    const turnId = newTurnId();
    if (!send(turnStartMessage(turnId))) {
      r.vad?.reset();
      return;
    }
    clearTurn();
    r.turnId = turnId;
    r.turnMode = 'voice';
    r.audioOn = false;
    dispatch({ type: 'start', turn_id: turnId, mode: 'voice' });
    const roll = r.roll;
    r.roll = [];
    for (const frame of roll) sendFrame(frame);
  }, [r, send, clearTurn, sendFrame]);

  const onFrame = useCallback((frame, rms) => {
    if (r.turnId) {
      if (r.turnMode !== 'voice' || r.ended) return;
      sendFrame(frame);
      if (r.frames >= TURN_CAP_FRAMES) endVoice('cap');
      else if (r.vad?.push(rms) === 'end') endVoice('silence');
      return;
    }
    // Between turns: only while the toy is free, and never in the moment
    // after its own voice.
    if (!canListen(stateRef.current) || r.hold || performance.now() < r.quietUntil) return;
    r.roll.push(frame);
    if (r.roll.length > PRE_ROLL_FRAMES) r.roll.shift();
    const verdict = r.vad?.push(rms);
    if (verdict === 'speech') beginTurn();
    else if (verdict) r.vad.reset();
  }, [r, sendFrame, endVoice, beginTurn]);

  const openMic = useCallback(() => {
    if (r.micState !== 'off' || r.hold) return;
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

  // Everything a socket leaves behind when it goes: the turn, Buddy's voice
  // and the mic (reopened on the next ready, so the browser's recording
  // light only shows while words can go out).
  const dropSocket = useCallback(() => {
    clearTimeout(r.readyTimer);
    clearInterval(r.statusTimer);
    r.ready = false;
    resetTurn();
    r.player.stop();
    closeMic();
  }, [r, resetTurn, closeMic]);

  const recover = useCallback((gen, code = null) => {
    const plan = reconnectPlan({ code, attempts: r.attempts, refetched: r.refetched });
    switch (plan.action) {
      case 'blocked':
        // Paused or removed: the sleepy face and no retry loop; the toy
        // comes back when the dashboard says it is awake.
        dispatch({ type: 'closed', code });
        callbacks.current.onBlocked?.();
        return;
      case 'replaced':
        // Opened in another tab or on another device. Fighting over it would
        // only bounce the two pages; the screen offers to take it back.
        dispatch({ type: 'closed', code });
        return;
      case 'refetch':
        // The signature was refused: ask for the credential once more and
        // sign in once; a second refusal gives up.
        r.refetched = true;
        secrets.delete(deviceId);
        connectRef.current(gen);
        return;
      case 'retry':
        r.attempts += 1;
        dispatch({ type: 'connecting', error: plan.error });
        clearTimeout(r.timer);
        r.timer = setTimeout(() => connectRef.current(gen), plan.delayMs);
        return;
      default:
        dispatch({ type: 'offline', error: plan.error });
    }
  }, [r, deviceId]);

  const onReady = useCallback((msg) => {
    clearTimeout(r.readyTimer);
    // A good sign-in earns a fresh budget, the refetch included, for the
    // next drop in this visit.
    r.ready = true;
    r.attempts = 0;
    r.refetched = false;
    r.sampleRate = Number(msg.sample_rate) || 16000;
    const quietHours = msg.quiet_hours === true;
    const limitReached = msg.limit_reached === true;
    dispatch({ type: 'ready', quietHours, limitReached });
    rearm(r);
    // Bedtime or today's time used up: every turn would get the sleepy clip,
    // so the mic waits for a tap instead of opening on its own.
    if (r.wantMic && !quietHours && !limitReached) openMic();
    send(statusMessage(!r.woke));
    r.woke = true;
    clearInterval(r.statusTimer);
    r.statusTimer = setInterval(() => send(statusMessage(false)), STATUS_EVERY_MS);
  }, [r, send, openMic]);

  const onTurnDone = useCallback((msg) => {
    if (msg.turn_id === r.turnId) {
      // An answer that failed halfway has no audio_end: what came still plays.
      if (r.audioOn) r.player.finish();
      clearTurn();
      if (msg.result === 'blocked') {
        r.wantMic = false;
        closeMic();
      } else if (r.hold) {
        closeMic();
      }
      dispatch({ type: 'turn_done', turn_id: msg.turn_id, result: msg.result });
      if (!r.player.playing) rearm(r);
    }
    // Even a turn this page gave up on may have changed the balance.
    callbacks.current.onSettled?.(msg);
  }, [r, clearTurn, closeMic]);

  const onMessage = useCallback((data, gen) => {
    // Anything at all shows the socket still carries (stallPlan).
    r.heard += 1;
    if (data instanceof ArrayBuffer) {
      const frame = decodeFrame(data);
      // Buddy's voice belongs to the open turn once the child has finished
      // (or to Buddy's own turn); anything else is the tail of a turn this
      // page already cancelled.
      if (!frame || frame.direction !== DOWNLINK || !r.turnId || (r.turnMode === 'voice' && !r.ended)) return;
      if (!r.audioOn) {
        r.audioOn = true;
        r.player.begin(r.sampleRate);
        dispatch({ type: 'audio', turn_id: r.turnId });
      }
      r.player.push(frame.payload);
      guard({ type: 'progress', turn_id: r.turnId, aheadMs: r.player.ahead * 1000 });
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'challenge': {
        const secret = r.secret;
        signHello(secret, typeof msg.nonce === 'string' ? msg.nonce : '', deviceId, msg.server_time)
          .then((signature) => {
            if (gen === r.gen) send(helloMessage(deviceId, signature));
          })
          .catch(() => {
            if (gen !== r.gen) return;
            // A credential that cannot sign is no use: forget it, and the
            // close takes the usual way back, with a fresh one next time.
            secrets.delete(deviceId);
            r.ws?.close();
          });
        break;
      }
      case 'ready':
        onReady(msg);
        break;
      case 'face':
        if (msg.turn_id !== r.turnId) break;
        if (msg.phase === 'thinking' && r.turnMode === 'voice' && !r.ended) {
          // The server ended the turn itself (its own length cap): stop
          // streaming, as after our own turn_end.
          r.ended = true;
          guard({ type: 'wait', turn_id: r.turnId });
          dispatch({ type: 'end', turn_id: r.turnId });
        }
        if (msg.phase === 'speaking') guard({ type: 'progress', turn_id: r.turnId });
        dispatch({ type: 'face', turn_id: msg.turn_id, emotion: msg.emotion, phase: msg.phase });
        break;
      case 'play_clip':
        if (msg.turn_id !== r.turnId) break;
        // turn_done comes right behind a clip; the watchdog waits for it.
        guard({ type: 'progress', turn_id: r.turnId });
        dispatch({ type: 'clip', turn_id: msg.turn_id, clip: msg.clip });
        break;
      case 'audio_end':
        // A cancelled turn's audio_end can still arrive when the server had
        // already finished; it must not end a newer answer.
        if (r.audioOn && (msg.turn_id === undefined || msg.turn_id === r.turnId)) {
          r.player.finish();
          if (r.turnId) guard({ type: 'progress', turn_id: r.turnId, aheadMs: r.player.ahead * 1000 });
        }
        break;
      case 'buddy_turn':
        // Buddy speaks first only into a quiet room (machine.js agrees).
        if (r.turnId || r.player.playing || !r.ready || typeof msg.turn_id !== 'string') break;
        clearTurn();
        r.turnId = msg.turn_id;
        r.turnMode = 'buddy';
        r.ended = true;
        r.audioOn = false;
        guard({ type: 'wait', turn_id: msg.turn_id });
        dispatch({ type: 'buddy_turn', turn_id: msg.turn_id });
        break;
      case 'turn_done':
        onTurnDone(msg);
        break;
      case 'error':
        dispatch({ type: 'error', code: msg.code });
        break;
      default:
        break;
    }
  }, [r, deviceId, send, onReady, onTurnDone, clearTurn, guard]);

  const connect = useCallback(async (gen) => {
    if (gen !== r.gen) return;
    dispatch({ type: 'connecting' });

    if (!webToySupported()) {
      dispatch({ type: 'offline', error: 'insecure' });
      return;
    }

    let secret = secrets.get(deviceId);
    if (!secret) {
      let out;
      try {
        out = await api.credential(deviceId);
        if (typeof out?.secret !== 'string') throw Object.assign(new Error('no secret'), { status: 500 });
      } catch (err) {
        if (gen !== r.gen) return;
        if (err.status === 404 || err.status === 409) {
          // Gone, or asleep (toy_not_active): what the dashboard shows is out
          // of date. Refresh it rather than retry a request that cannot pass.
          dispatch({ type: 'asleep' });
          callbacks.current.onBlocked?.();
        } else if (err.status === 401 || err.status === 403 || err.status === 429) {
          dispatch({ type: 'offline', error: err.code });
        } else {
          recover(gen);
        }
        return;
      }
      // The parent signed out, or this page moved on, while the request was
      // out: the sign-out already cleared the cache, and a secret kept now
      // would outlive it.
      if (gen !== r.gen || !hasSession()) return;
      secret = out.secret;
      secrets.set(deviceId, secret);
    }
    r.secret = secret;

    let ws;
    try {
      ws = new WebSocket(deviceSocketUrl());
    } catch {
      recover(gen);
      return;
    }
    ws.binaryType = 'arraybuffer';
    r.ws = ws;
    r.ready = false;
    clearTimeout(r.readyTimer);
    r.readyTimer = setTimeout(() => {
      if (gen === r.gen && r.ws === ws && !r.ready) ws.close();
    }, READY_TIMEOUT_MS);
    ws.onmessage = (ev) => {
      if (gen === r.gen) onMessage(ev.data, gen);
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (gen !== r.gen) return;
      r.ws = null;
      dropSocket();
      recover(gen, ev.code);
    };
  }, [r, deviceId, onMessage, recover, dropSocket]);
  connectRef.current = connect;

  // Everything this page holds for the toy, let go of at once: leaving,
  // or starting over on a new socket (which takes the secret from the cache
  // again, if it is still there).
  const teardown = useCallback((reason) => {
    r.gen += 1;
    clearTimeout(r.timer);
    dropSocket();
    r.secret = null;
    const ws = r.ws;
    r.ws = null;
    ws?.close(1000, reason);
  }, [r, dropSocket]);

  useEffect(() => {
    if (!deviceId) return undefined;
    if (!enabled) {
      dispatch({ type: 'asleep' });
      return undefined;
    }
    r.attempts = 0;
    r.refetched = false;
    teardown('restart');
    connect(r.gen);
    return () => teardown('leaving');
  }, [deviceId, enabled, r, connect, teardown]);

  // A hold closes the mic once nothing is open (an answer on its way still
  // arrives, and onTurnDone closes it then). Lifting it means what stood in
  // the way is gone (credits bought, a Buddy set up), so a refusal it caused
  // no longer stands and the mic opens again, hands-free as before.
  useEffect(() => {
    const was = r.hold;
    r.hold = Boolean(hold);
    if (r.hold) {
      if (!r.turnId) closeMic();
      return;
    }
    if (was && stateRef.current.status === 'denied') {
      r.wantMic = micSupported();
      dispatch({ type: 'resume' });
    }
    if (r.wantMic && r.ready) openMic();
  }, [hold, r, openMic, closeMic]);

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

  // Cuts Buddy short: its voice stops and the open turn, if any, is
  // cancelled, which costs nothing.
  const interrupt = useCallback(() => {
    if (r.turnId) send(cancelMessage(r.turnId));
    r.player.stop();
    resetTurn();
    dispatch({ type: 'interrupt' });
    rearm(r);
  }, [r, send, resetTurn]);

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
      endVoice('tap');
    } else if (action === 'interrupt') {
      interrupt();
    }
  }, [r, closeMic, openMic, endVoice, interrupt]);

  // Development only: backend-v2 hears turn_end text only where the server
  // allows typed turns, and production refuses them.
  const sendText = useCallback((text) => {
    const clean = String(text ?? '').trim().slice(0, MAX_TEXT);
    if (!clean || !canSend(stateRef.current) || r.hold) return false;
    r.player.unlock();
    if (r.turnId || r.player.playing) interrupt();
    const turnId = newTurnId();
    if (!send(turnStartMessage(turnId))) return false;
    clearTurn();
    r.turnId = turnId;
    r.turnMode = 'text';
    r.ended = true;
    r.audioOn = false;
    send(turnEndMessage(turnId, 'tap', clean));
    guard({ type: 'wait', turn_id: turnId });
    dispatch({ type: 'start', turn_id: turnId, mode: 'text', text: clean });
    return true;
  }, [r, send, clearTurn, interrupt, guard]);

  // Starts over on a fresh socket. freshMic: a manual reconnect tries the
  // mic again too, even after it was refused.
  const restart = useCallback((freshMic) => {
    if (!enabled) return;
    if (freshMic) r.wantMic = micSupported();
    r.attempts = 0;
    r.refetched = false;
    teardown('restart');
    connect(r.gen);
  }, [r, enabled, teardown, connect]);

  // The watchdog gave up on the open turn. It is cancelled (free, and a
  // late turn_done then matches nothing), the screen says so, and the toy
  // listens again: on this socket when the server still said something
  // after the turn last moved, otherwise on a fresh one.
  const stall = useCallback(() => {
    const dog = r.dog;
    if (!dog || dog.turnId !== r.turnId) return;
    const plan = stallPlan({ open: r.ws?.readyState === WebSocket.OPEN, heard: r.heard, dog });
    send(cancelMessage(dog.turnId));
    r.player.stop();
    resetTurn();
    dispatch({ type: 'stalled', turn_id: dog.turnId });
    if (plan === 'reconnect') {
      restart(false);
      return;
    }
    if (r.hold) closeMic();
    rearm(r);
  }, [r, send, resetTurn, restart, closeMic]);
  stallRef.current = stall;

  // backend-v2 keeps a chat's short history per connection, so a fresh
  // connection is a fresh conversation (what Buddy has learned stays).
  const newConversation = useCallback(() => {
    if (!canListen(stateRef.current) || r.turnId || !r.ready) return false;
    dispatch({ type: 'conversation_new' });
    restart(false);
    return true;
  }, [r, restart]);

  const reconnect = useCallback(() => restart(true), [restart]);

  const onLevel = useCallback((fn) => {
    r.levelFns.add(fn);
    return () => r.levelFns.delete(fn);
  }, [r]);

  const clearError = useCallback(() => dispatch({ type: 'clear_error' }), []);

  return { state, tap, sendText, newConversation, reconnect, onLevel, clearError };
}
