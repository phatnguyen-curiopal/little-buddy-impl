// A simulated toy speaking the device protocol, for tests, local development
// and the protocol contract test the API design calls for.

import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import { decodeFrame, DOWNLINK, encodeFrame, FRAME_BYTES, UPLINK } from '../audio/frames.ts';
import { makeClaimToken, signChallenge } from '../devices/credentials.ts';
import { fromB64url } from '../util/crypto.ts';

export interface TurnResult {
  turnId: string;
  result: string;
  faces: string[];
  clips: string[];
  audio: Buffer;
  messages: Record<string, unknown>[];
  // From turn_end to Buddy's first audio frame, as the toy hears it.
  firstAudioMs: number | null;
}

export interface TurnInput {
  pcm?: Buffer;
  text?: string;
  // Send frames every 20 ms like a real microphone instead of all at once.
  realtime?: boolean;
  // Silent frames after the speech, the way a toy keeps streaming while its
  // voice detector waits to be sure the child has finished.
  silenceMs?: number;
  cancelAfterMs?: number;
  timeoutMs?: number;
}

export class ToyClient {
  private ws: WebSocket | null = null;
  private readonly deviceId: string;
  private readonly secret: Buffer;
  private listeners: ((msg: Record<string, unknown> | Buffer) => void)[] = [];
  ready: Record<string, unknown> | null = null;
  closeCode: number | null = null;

  constructor(deviceId: string, secretB64url: string) {
    this.deviceId = deviceId;
    this.secret = fromB64url(secretB64url);
  }

  claimToken(nowSec = Math.floor(Date.now() / 1000)): string {
    return makeClaimToken(this.secret, this.deviceId, nowSec);
  }

  connect(url: string, opts: { badSignature?: boolean; protocol?: number } = {}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.on('message', (data, isBinary) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (isBinary) {
          for (const l of this.listeners) l(buf);
          return;
        }
        const msg = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
        if (msg.type === 'challenge') {
          const signature = opts.badSignature
            ? 'x'.repeat(43)
            : signChallenge(this.secret, String(msg.nonce), this.deviceId, Number(msg.server_time));
          ws.send(JSON.stringify({ type: 'hello', device_id: this.deviceId, protocol: opts.protocol ?? 1, firmware: '0.1.0-sim', battery: 90, signature }));
        } else if (msg.type === 'ready') {
          this.ready = msg;
          resolve(msg);
        }
        for (const l of this.listeners) l(msg);
      });
      ws.on('close', (code) => {
        this.closeCode = code;
        if (!this.ready) reject(Object.assign(new Error(`closed before ready (${code})`), { code }));
      });
      ws.on('error', (err) => {
        if (!this.ready) reject(err);
      });
    });
  }

  // One turn: tap, stream audio (or send dev text), end, and collect the reply.
  turn(input: TurnInput): Promise<TurnResult> {
    const ws = this.ws!;
    const turnId = randomUUID();
    const out: TurnResult = { turnId, result: '', faces: [], clips: [], audio: Buffer.alloc(0), messages: [], firstAudioMs: null };
    const chunks: Buffer[] = [];
    let endAt: number | null = null;
    let done = false;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('turn timed out')), input.timeoutMs ?? 15_000);
      const listener = (m: Record<string, unknown> | Buffer) => {
        if (Buffer.isBuffer(m)) {
          const f = decodeFrame(m);
          if (f && f.direction === DOWNLINK) {
            if (out.firstAudioMs === null && endAt !== null) out.firstAudioMs = Math.round(performance.now() - endAt);
            chunks.push(f.payload);
          }
          return;
        }
        if (m.turn_id !== turnId) return;
        out.messages.push(m);
        if (m.type === 'face') out.faces.push(String(m.emotion));
        if (m.type === 'play_clip') out.clips.push(String(m.clip));
        if (m.type === 'turn_done') {
          done = true;
          clearTimeout(timer);
          this.listeners = this.listeners.filter((l) => l !== listener);
          out.result = String(m.result);
          out.audio = Buffer.concat(chunks);
          resolve(out);
        }
      };
      this.listeners.push(listener);
      ws.send(JSON.stringify({ type: 'turn_start', turn_id: turnId }));

      const pcm = input.pcm ?? Buffer.alloc(0);
      const frames: Buffer[] = [];
      for (let i = 0; i < pcm.length; i += FRAME_BYTES) frames.push(pcm.subarray(i, i + FRAME_BYTES));
      for (let i = 0; i < Math.round((input.silenceMs ?? 0) / 20); i += 1) frames.push(Buffer.alloc(FRAME_BYTES));
      const stream = async () => {
        const start = performance.now();
        for (let i = 0; i < frames.length && !done; i += 1) {
          if (input.realtime) {
            // Paced against the start so timer drift does not add up.
            const wait = start + i * 20 - performance.now();
            if (wait > 0) await new Promise((r) => setTimeout(r, wait));
          }
          ws.send(encodeFrame(UPLINK, i, frames[i]));
        }
        if (done) return;
        endAt = performance.now();
        ws.send(JSON.stringify({ type: 'turn_end', turn_id: turnId, reason: 'tap', ...(input.text ? { text: input.text } : {}) }));
        if (input.cancelAfterMs !== undefined) setTimeout(() => ws.send(JSON.stringify({ type: 'cancel', turn_id: turnId })), input.cancelAfterMs);
      };
      stream().catch(reject);
    });
  }

  // What a toy sends now and then; event 'wake' when it is picked up.
  sendStatus(event: 'wake' | null = null): void {
    this.ws?.send(JSON.stringify({ type: 'status', battery: 80, wifi_rssi: -55, charging: false, ...(event && { event }) }));
  }

  // A turn Buddy starts by itself (buddy_turn, faces and audio, turn_done),
  // or null when none comes in time.
  buddyTurn(timeoutMs = 3000): Promise<TurnResult | null> {
    return new Promise((resolve) => {
      let out: TurnResult | null = null;
      const chunks: Buffer[] = [];
      const finish = (r: TurnResult | null) => {
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== listener);
        resolve(r);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      const listener = (m: Record<string, unknown> | Buffer) => {
        if (Buffer.isBuffer(m)) {
          const f = decodeFrame(m);
          if (out && f && f.direction === DOWNLINK) chunks.push(f.payload);
          return;
        }
        if (m.type === 'buddy_turn' && !out) {
          out = { turnId: String(m.turn_id), result: '', faces: [], clips: [], audio: Buffer.alloc(0), messages: [], firstAudioMs: null };
          return;
        }
        if (!out || m.turn_id !== out.turnId) return;
        out.messages.push(m);
        if (m.type === 'face') out.faces.push(String(m.emotion));
        if (m.type === 'turn_done') {
          out.result = String(m.result);
          out.audio = Buffer.concat(chunks);
          finish(out);
        }
      };
      this.listeners.push(listener);
    });
  }

  waitForClose(timeoutMs = 5000): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.closeCode !== null) return resolve(this.closeCode);
      const timer = setTimeout(() => reject(new Error('socket did not close')), timeoutMs);
      this.ws?.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): void {
    this.ws?.close();
  }
}
