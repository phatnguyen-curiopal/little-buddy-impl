import { useCallback, useEffect, useRef, useState } from 'react';
import { signRequest } from './signing.js';
import { call } from './api.js';
import { append } from './log.js';
import * as session from './session.js';

// A toy as firmware would behave, driven from the browser. Timers and the
// socket live in a ref (they must survive re-renders and be cleaned up
// exactly once); what the screen shows lives in state.

const FIRMWARE = 'sim-web-0.1';
const FRAME_BYTES = 640; // 20 ms of PCM16 at 16 kHz
const nowSec = () => Math.floor(Date.now() / 1000);

const initialStream = { state: 'closed', readyAt: null, lastPong: null, closeCode: null, closeReason: null, framesSent: 0, refusedHint: null, cutBadge: false };

// One button press. phase: idle | listening (accepted, frames flowing) |
// thinking (turn_end sent, waiting for the answer). lastEmotion is what the
// toy's face shows; lastSay is what it would speak.
const initialTurn = { phase: 'idle', turnId: null, lastEmotion: null, lastSay: null, lastStatus: null, lastError: null };

const initialState = {
  phase: 'idle', // idle | heartbeating | streaming | backoff | halted
  status: null, // last status the server reported
  lastCode: null,
  intervalS: null,
  nextBeatAt: null,
  backoffUntil: null,
  offsetS: 0,
  skewS: 0,
  uptimeS: 0,
  haltReason: null,
  stream: initialStream,
  turn: initialTurn,
};

const EMOTION_FACES = {
  listening: '(o_o) listening...',
  thinking: '(-_-) thinking...',
  happy: ':D happy',
  sleepy: 'zz sleepy',
  confused: '(?_?) confused',
};

export function faceFor(s) {
  if (s.phase === 'idle') return 'off';
  // A turn's emotion wins over the resting face while it is on screen.
  if (s.turn.phase === 'listening') return EMOTION_FACES.listening;
  if (s.turn.phase === 'thinking') return EMOTION_FACES.thinking;
  if (s.turn.lastEmotion) return EMOTION_FACES[s.turn.lastEmotion] ?? s.turn.lastEmotion;
  if (s.phase === 'halted') return `?? cannot prove who I am (${s.haltReason})`;
  if (s.phase === 'backoff') {
    const left = Math.max(0, Math.ceil((s.backoffUntil - Date.now()) / 1000));
    return s.lastCode === 'rate_limited' ? `backing off ${left} s` : 'server busy, retrying';
  }
  if (s.lastCode === 'auth_ts_skew') return 'resyncing clock';
  switch (s.status) {
    case 'provisioned': return 'waiting for a grown-up';
    case 'active': return ':) normal face';
    case 'disabled': return 'zz sleeping (paused)';
    case 'revoked': return 'zz sleeping (revoked)';
    default: return 'starting';
  }
}

export function useToy() {
  const [state, setState] = useState(initialState);
  const ref = useRef({ timer: null, socket: null, ready: false, startedAt: null, backoffS: 5, offsetS: 0, skewS: 0, running: false, creds: null, burst: null, badge: null, lastSent: null });
  const r = ref.current;

  const patch = useCallback((p) => setState((prev) => ({ ...prev, ...p })), []);
  const patchStream = useCallback((p) => setState((prev) => ({ ...prev, stream: { ...prev.stream, ...p } })), []);
  const patchTurn = useCallback((p) => setState((prev) => ({ ...prev, turn: { ...prev.turn, ...p } })), []);

  const sign = useCallback(({ method, path, bodyText }) =>
    signRequest({ secretHex: r.creds.secretHex, deviceId: r.creds.deviceId, method, path, bodyText, ts: nowSec() + r.offsetS + r.skewS }), [r]);

  const schedule = useCallback((sec, fn) => {
    clearTimeout(r.timer);
    patch({ nextBeatAt: Date.now() + sec * 1000 });
    r.timer = setTimeout(fn, sec * 1000);
  }, [r, patch]);

  const halt = useCallback((reason) => {
    clearTimeout(r.timer);
    r.running = false;
    patch({ phase: 'halted', haltReason: reason, nextBeatAt: null });
  }, [r, patch]);

  const syncClock = useCallback(async () => {
    const res = await call('GET', '/v1/time');
    r.offsetS = res.server_time - nowSec();
    patch({ offsetS: r.offsetS });
  }, [r, patch]);

  const beat = useCallback(async (retried = false) => {
    if (!r.running) return;
    clearTimeout(r.timer);
    const uptimeS = Math.floor((Date.now() - r.startedAt) / 1000);
    const bodyText = JSON.stringify({ firmware_version: FIRMWARE, uptime_s: uptimeS });
    let signed;
    try {
      signed = await sign({ method: 'POST', path: '/v1/heartbeat', bodyText });
    } catch (err) {
      halt(`bad credentials: ${err.message}`);
      return;
    }
    try {
      const res = await call('POST', '/v1/heartbeat', { bodyText, headers: signed.headers });
      r.backoffS = 5;
      r.offsetS = res.server_time - nowSec();
      patch({
        status: res.status,
        intervalS: res.heartbeat_interval_s,
        offsetS: r.offsetS,
        lastCode: null,
        uptimeS,
        phase: r.ready ? 'streaming' : 'heartbeating',
        backoffUntil: null,
      });
      schedule(res.heartbeat_interval_s, () => beat());
    } catch (err) {
      const code = err.code;
      const serverTime = err.body?.error?.server_time;
      if (code === 'auth_ts_skew' && !retried) {
        // Exactly what firmware does: take the server's clock and try once more.
        if (Number.isInteger(serverTime)) r.offsetS = serverTime - nowSec() - r.skewS;
        patch({ offsetS: r.offsetS, lastCode: code });
        return beat(true);
      }
      if (code === 'auth_replay' && !retried) return beat(true);
      if (err.status === 401) return halt(code);
      if (code === 'device_revoked') {
        // Terminal, but keep beating so the screen shows it stays refused.
        patch({ status: 'revoked', lastCode: code, phase: 'heartbeating', intervalS: 60 });
        schedule(60, () => beat());
        return;
      }
      if (err.status === 429) {
        const wait = Number(err.retryAfter) || 60;
        patch({ phase: 'backoff', lastCode: code, backoffUntil: Date.now() + wait * 1000 });
        schedule(wait, () => beat());
        return;
      }
      const wait = r.backoffS;
      r.backoffS = Math.min(r.backoffS * 2, 60);
      patch({ phase: 'backoff', lastCode: code ?? 'network_error', backoffUntil: Date.now() + wait * 1000 });
      schedule(wait, () => beat());
    }
  }, [r, sign, halt, patch, schedule]);

  const closeStream = useCallback((code = 1000, reason = 'client close') => {
    clearInterval(r.burst);
    r.burst = null;
    if (r.socket) r.socket.close(code, reason);
  }, [r]);

  const stop = useCallback(() => {
    clearTimeout(r.timer);
    r.running = false;
    closeStream();
    patch({ phase: 'idle', nextBeatAt: null, backoffUntil: null, lastCode: null });
  }, [r, closeStream, patch]);

  const start = useCallback(async () => {
    const creds = session.get().toy;
    r.creds = { deviceId: creds.deviceId.trim(), secretHex: creds.secretHex.trim() };
    r.running = true;
    r.ready = false;
    r.startedAt = Date.now();
    r.backoffS = 5;
    patch({ ...initialState, phase: 'heartbeating', skewS: r.skewS, offsetS: r.offsetS, stream: initialStream });
    try {
      await syncClock();
    } catch (err) {
      // /v1/time is rate limited per ip; a failed sync is not fatal, the
      // first heartbeat's auth_ts_skew will correct the offset anyway.
      patch({ lastCode: err.code });
    }
    await beat();
  }, [r, patch, syncClock, beat]);

  const beatNow = useCallback(() => {
    if (!r.running) r.running = true;
    if (!r.startedAt) r.startedAt = Date.now();
    if (!r.creds) {
      const creds = session.get().toy;
      r.creds = { deviceId: creds.deviceId.trim(), secretHex: creds.secretHex.trim() };
    }
    return beat();
  }, [r, beat]);

  const setSkew = useCallback((s) => {
    r.skewS = Number(s) || 0;
    patch({ skewS: r.skewS });
  }, [r, patch]);

  const openStream = useCallback(async () => {
    if (r.socket) return;
    if (!r.creds) {
      const creds = session.get().toy;
      r.creds = { deviceId: creds.deviceId.trim(), secretHex: creds.secretHex.trim() };
    }
    let signed;
    try {
      signed = await sign({ method: 'GET', path: '/v1/stream' });
    } catch (err) {
      patchStream({ refusedHint: `bad credentials: ${err.message}` });
      return;
    }
    const url = `${location.origin.replace(/^http/, 'ws')}/v1/stream?${new URLSearchParams(signed.query)}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    r.socket = ws;
    r.ready = false;
    const t0 = performance.now();
    patchStream({ state: 'connecting', closeCode: null, closeReason: null, refusedHint: null, framesSent: 0, cutBadge: false });

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'ready') {
        r.ready = true;
        patchStream({ state: 'open', readyAt: msg.server_time });
        patch({ phase: 'streaming', turn: initialTurn });
        append({ method: 'WS', path: '/v1/stream', status: 101, ms: Math.round(performance.now() - t0), req: { device_id: r.creds.deviceId, auth: 'query string' }, res: msg });
        return;
      }
      if (msg.type === 'pong') {
        patchStream({ lastPong: msg.server_time });
        append({ method: 'WS', path: '/v1/stream', status: 'msg', ms: 0, req: { type: 'ping' }, res: msg });
        return;
      }
      append({ method: 'WS', path: '/v1/stream', status: 'msg', ms: 0, req: r.lastSent ?? null, res: msg });
      r.lastSent = null;
      switch (msg.type) {
        case 'turn_accepted':
          patchTurn({ phase: 'listening', turnId: msg.turn_id, lastEmotion: null, lastSay: null, lastStatus: null, lastError: null });
          break;
        case 'turn_denied':
          // No reason arrives here on purpose; the Parent lane's turns list has it.
          patchTurn({ phase: 'idle', turnId: null, lastEmotion: msg.emotion, lastSay: msg.say, lastStatus: 'denied', lastError: null });
          break;
        case 'answer':
          patchTurn({ phase: 'idle', lastEmotion: msg.emotion, lastSay: msg.say });
          break;
        case 'turn_done':
          patchTurn({ phase: 'idle', turnId: null, lastStatus: msg.status });
          break;
        case 'error':
          patchTurn({ lastError: msg.code });
          break;
        default:
          break;
      }
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      clearInterval(r.burst);
      r.burst = null;
      r.socket = null;
      const wasReady = r.ready;
      r.ready = false;
      const reason = ev.reason || null;
      append({ method: 'WS', path: '/v1/stream', status: `close ${ev.code}`, ms: Math.round(performance.now() - t0), req: null, res: { code: ev.code, reason } });
      patchTurn({ phase: 'idle', turnId: null });
      if (ev.code === 4003) {
        // The kill switch: the server named the new status in the reason.
        patch({ status: reason || 'disabled', phase: r.running ? 'heartbeating' : 'idle' });
        patchStream({ state: 'closed', closeCode: ev.code, closeReason: reason, cutBadge: true });
        clearTimeout(r.badge);
        r.badge = setTimeout(() => patchStream({ cutBadge: false }), 5000);
        if (r.running) beat();
        return;
      }
      patch({ phase: r.running ? 'heartbeating' : 'idle' });
      patchStream({
        state: 'closed',
        closeCode: ev.code,
        closeReason: reason,
        // Browsers hide the 401/403 body of a refused upgrade. Only a
        // revoked toy or a bad signature is refused now; the last heartbeat
        // is the best available explanation.
        refusedHint: wasReady ? null : `upgrade refused (browser hides the 401/403 body); last heartbeat said: ${stateRef.current.status ?? 'nothing yet'}`,
      });
    };
  }, [r, sign, patch, patchStream, patchTurn, beat]);

  const sendText = useCallback((obj) => {
    if (r.socket?.readyState !== WebSocket.OPEN) return false;
    r.lastSent = obj;
    r.socket.send(JSON.stringify(obj));
    return true;
  }, [r]);

  // The button. Press reserves a credit if the gate allows; turn_end (the
  // toy heard the child stop, or a second tap) asks for the answer; cancel
  // gives the credit back.
  const pressButton = useCallback(() => {
    if (sendText({ type: 'turn_start' })) patchTurn({ lastError: null, lastStatus: null });
  }, [sendText, patchTurn]);
  const release = useCallback(() => {
    if (sendText({ type: 'turn_end' })) patchTurn({ phase: 'thinking' });
  }, [sendText, patchTurn]);
  const cancelTurn = useCallback(() => sendText({ type: 'turn_cancel' }), [sendText]);

  // onclose needs the latest status without re-creating the handler.
  const stateRef = useRef(state);
  stateRef.current = state;

  const ping = useCallback(() => {
    if (r.socket?.readyState === WebSocket.OPEN) r.socket.send(JSON.stringify({ type: 'ping' }));
  }, [r]);

  // 640-byte frames 20 ms apart, a quiet sine so a future pipeline sees
  // non-zero audio. Refuses to pile up when the socket cannot drain.
  const burst = useCallback((count = 50) => {
    if (!r.socket || r.socket.readyState !== WebSocket.OPEN || r.burst) return;
    let sent = 0;
    let phase = 0;
    r.burst = setInterval(() => {
      const ws = r.socket;
      if (!ws || ws.readyState !== WebSocket.OPEN || sent >= count || ws.bufferedAmount > 64 * 1024) {
        clearInterval(r.burst);
        r.burst = null;
        return;
      }
      const frame = new Int16Array(FRAME_BYTES / 2);
      for (let i = 0; i < frame.length; i += 1, phase += 1) frame[i] = Math.round(Math.sin(phase * 0.17) * 800);
      ws.send(frame.buffer);
      sent += 1;
      setState((prev) => ({ ...prev, stream: { ...prev.stream, framesSent: prev.stream.framesSent + 1 } }));
    }, 20);
  }, [r]);

  useEffect(() => () => {
    clearTimeout(r.timer);
    clearTimeout(r.badge);
    clearInterval(r.burst);
    if (r.socket) r.socket.close(1000, 'unmount');
  }, [r]);

  return { state, face: faceFor(state), start, stop, beatNow, syncClock, setSkew, openStream, closeStream, ping, burst, pressButton, release, cancelTurn };
}
