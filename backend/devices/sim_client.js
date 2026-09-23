import WebSocket from 'ws';
import { signRequest, newNonce } from './signing.js';

// A device as the firmware would behave: it signs with the same pure
// functions the server verifies with, so any drift between "what firmware
// should do" and "what the server checks" fails a test instead of a toy.
// clockOffsetS and nonceFn are injectable so tests can produce a stale
// timestamp or a repeated nonce on purpose.
export class SimDevice {
  constructor({ deviceId, secretHex, baseUrl, clockOffsetS = 0, nonceFn = newNonce }) {
    this.deviceId = deviceId;
    this.secret = Buffer.from(secretHex, 'hex');
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.wsUrl = this.baseUrl.replace(/^http/, 'ws');
    this.clockOffsetS = clockOffsetS;
    this.nonceFn = nonceFn;
  }

  now() {
    return Math.floor(Date.now() / 1000) + this.clockOffsetS;
  }

  sign({ method, path, body }) {
    return signRequest({ secret: this.secret, deviceId: this.deviceId, method, path, body, ts: this.now(), nonce: this.nonceFn() });
  }

  async request(method, path, body, { headersOverride, bodyOverride } = {}) {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const signed = this.sign({ method, path, body: payload });
    const headers = { ...signed.headers, ...headersOverride };
    if (payload) headers['content-type'] = 'application/json';
    const res = await fetch(this.baseUrl + path, { method, headers, body: bodyOverride ?? payload });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json, headers: res.headers, signed };
  }

  heartbeat(body = {}) {
    return this.request('POST', '/v1/heartbeat', body);
  }

  time() {
    return fetch(`${this.baseUrl}/v1/time`).then((r) => r.json());
  }

  // Query-string form by default (what a browser or a minimal embedded client
  // can do); header form for clients that support it.
  streamTarget({ useHeaders = false, signedPath = '/v1/stream' } = {}) {
    const signed = this.sign({ method: 'GET', path: signedPath });
    if (useHeaders) return { url: `${this.wsUrl}/v1/stream`, headers: signed.headers };
    return { url: `${this.wsUrl}/v1/stream?${new URLSearchParams(signed.query)}`, headers: {} };
  }

  // Waits for the next text frame whose type is in `types`, as firmware
  // would after sending a command. Rejects on close or timeout.
  static nextMessage(ws, types, timeoutMs = 5000) {
    const wanted = Array.isArray(types) ? types : [types];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timed out waiting for ${wanted.join('|')}`));
      }, timeoutMs);
      const onMessage = (data, isBinary) => {
        if (isBinary) return;
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (!wanted.includes(msg.type)) return;
        cleanup();
        resolve(msg);
      };
      const onClose = (code) => {
        cleanup();
        reject(Object.assign(new Error(`socket closed (${code}) while waiting for ${wanted.join('|')}`), { code }));
      };
      const cleanup = () => {
        clearTimeout(timer);
        ws.off('message', onMessage);
        ws.off('close', onClose);
      };
      ws.on('message', onMessage);
      ws.on('close', onClose);
    });
  }

  turnStart(ws) {
    const reply = SimDevice.nextMessage(ws, ['turn_accepted', 'turn_denied', 'error']);
    ws.send(JSON.stringify({ type: 'turn_start' }));
    return reply;
  }

  // Resolves { answer, done } for an answered turn, or { error } when the
  // server reports protocol misuse.
  async turnEnd(ws) {
    const first = SimDevice.nextMessage(ws, ['answer', 'error']);
    ws.send(JSON.stringify({ type: 'turn_end' }));
    const msg = await first;
    if (msg.type === 'error') return { error: msg };
    const done = await SimDevice.nextMessage(ws, ['turn_done']);
    return { answer: msg, done };
  }

  turnCancel(ws) {
    const reply = SimDevice.nextMessage(ws, ['turn_done', 'error']);
    ws.send(JSON.stringify({ type: 'turn_cancel' }));
    return reply;
  }

  sendFrames(ws, count) {
    for (let i = 0; i < count; i += 1) ws.send(Buffer.alloc(640));
  }

  // Resolves with the open socket once `ready` arrives; rejects with
  // { status, body } when the upgrade is refused.
  openStream(opts) {
    const { url, headers } = this.streamTarget(opts);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers });
      ws.on('unexpected-response', (req, res) => {
        let text = '';
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => {
          let body = null;
          try {
            body = JSON.parse(text);
          } catch {
            body = null;
          }
          reject(Object.assign(new Error(`upgrade refused: ${res.statusCode}`), { status: res.statusCode, body }));
        });
      });
      ws.on('error', (err) => reject(err));
      ws.once('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ready') resolve({ ws, ready: msg });
        else reject(new Error(`expected ready, got ${msg.type}`));
      });
    });
  }
}
