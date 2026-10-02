import { WebSocketServer } from 'ws';
import * as registry from '../devices/registry.js';
import { verifyDeviceRequest, extractAuth, nowSec } from '../devices/hmac_auth.js';
import { EMPTY_BODY_HASH } from '../devices/signing.js';
import { handleText, handleBinary, abandonSocket, safeSend } from './turns.js';
import log from '../lib/log.js';

// /v1/stream: the realtime channel. Any non-revoked toy may connect; what
// it may do is decided per turn by the ask gate (ws/turns.js), so an
// unclaimed or paused toy hears a kind refusal instead of a closed door.
// Audio frames are buffered on the open turn (ws/turns.js) and otherwise
// dropped.
export const STREAM_PATH = '/v1/stream';
export const CLOSE_BLOCKED = 4003;
// One message at most. A 20 ms frame is 640 bytes and a typed turn is at
// most 2000 characters, so 64 KB is generous; anything bigger is closed by
// ws with 1009 before it is ever buffered.
export const MAX_PAYLOAD = 64 * 1024;
// Cloudflare drops a WebSocket that carries nothing for 100 s and nginx's
// default read timeout is 60 s, while a toy can sit idle far longer between
// presses (the web toy sends no heartbeat at all). A protocol ping is
// answered by the client's WebSocket stack, so it keeps the path open
// without any firmware or browser code.
export const KEEPALIVE_MS = 30_000;

const STATUS_TEXT = { 401: 'Unauthorized', 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Unavailable' };

// device id -> open sockets, so a status change can reach a live stream.
const sockets = new Map();

function track(ws) {
  const id = ws.device.id;
  if (!sockets.has(id)) sockets.set(id, new Set());
  sockets.get(id).add(ws);
  ws.once('close', () => {
    const set = sockets.get(id);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) sockets.delete(id);
  });
}

// The kill switch. The in-flight turn is released before the close frame
// goes out, so a late turn_end from the toy finds nothing to charge.
export function closeDeviceSockets(deviceId, reason) {
  const set = sockets.get(deviceId);
  if (!set) return 0;
  for (const ws of set) {
    abandonSocket(ws, 'blocked');
    ws.close(CLOSE_BLOCKED, reason);
  }
  return set.size;
}

export function openSocketCount(deviceId) {
  return sockets.get(deviceId)?.size ?? 0;
}

// `verifyClient` cannot write a body, so the rejection is a hand-written
// HTTP response on the raw socket, in the same shape as every other device
// error.
function rejectUpgrade(socket, { http, code, message }) {
  const body = JSON.stringify({ error: { code, message, server_time: nowSec() } });
  socket.write(
    `HTTP/1.1 ${http} ${STATUS_TEXT[http] ?? 'Bad Request'}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      'Connection: close\r\n\r\n' +
      body,
  );
  socket.destroy();
}

export function attachStream(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    const url = new URL(req.url, 'http://localhost');
    // Anything but the stream path is not a protocol error worth answering.
    if (url.pathname !== STREAM_PATH) {
      socket.destroy();
      return;
    }
    const { deviceId, ts, nonce, sig } = extractAuth({ headers: req.headers, query: Object.fromEntries(url.searchParams) });
    // Revoked devices are refused inside the verifier; every other status
    // gets a socket and a per-turn answer.
    const result = await verifyDeviceRequest({
      method: 'GET',
      path: url.pathname,
      deviceId,
      ts,
      nonce,
      sig,
      bodyHash: EMPTY_BODY_HASH,
      ip: req.socket.remoteAddress,
    });
    if (!result.ok) return rejectUpgrade(socket, result);

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.device = result.device;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    track(ws);
    ws.turn = null;
    ws.language = undefined;
    ws.on('error', () => {});
    ws.on('message', (data, isBinary) => {
      if (isBinary) return handleBinary(ws, data);
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return undefined;
      }
      if (msg?.type === 'ping') return safeSend(ws, { type: 'pong', server_time: nowSec() });
      return handleText(ws, msg).catch((err) => log.error('turn_handler_failed', { device_id: ws.device.id, err_message: err.message }));
    });
    const keepalive = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, KEEPALIVE_MS);
    ws.on('close', () => {
      clearInterval(keepalive);
      abandonSocket(ws, 'socket_closed');
    });
    safeSend(ws, { type: 'ready', device_id: ws.device.id, server_time: nowSec() });
    log.info('stream_open', { device_id: ws.device.id });
  });

  registry.setDeviceBlockedHook((deviceId, status) => {
    const n = closeDeviceSockets(deviceId, status);
    if (n) log.info('stream_closed_by_status', { device_id: deviceId, status, sockets: n });
  });

  return wss;
}
