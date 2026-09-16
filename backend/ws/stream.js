import { WebSocketServer } from 'ws';
import * as registry from '../devices/registry.js';
import { verifyDeviceRequest, extractAuth, requireActiveCheck, nowSec } from '../devices/hmac_auth.js';
import { EMPTY_BODY_HASH } from '../devices/signing.js';
import log from '../lib/log.js';

// /v1/stream: the realtime audio channel. This step only authenticates the
// upgrade, says `ready`, and drops the socket the moment the device is
// disabled or revoked. Audio frames are accepted and discarded until the
// streaming pipeline lands.
export const STREAM_PATH = '/v1/stream';
export const CLOSE_BLOCKED = 4003;

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

export function closeDeviceSockets(deviceId, reason) {
  const set = sockets.get(deviceId);
  if (!set) return 0;
  for (const ws of set) ws.close(CLOSE_BLOCKED, reason);
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

function handleText(ws, data) {
  let msg;
  try {
    msg = JSON.parse(data.toString());
  } catch {
    return;
  }
  if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong', server_time: nowSec() }));
}

export function attachStream(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    const url = new URL(req.url, 'http://localhost');
    // Anything but the stream path is not a protocol error worth answering.
    if (url.pathname !== STREAM_PATH) {
      socket.destroy();
      return;
    }
    const { deviceId, ts, nonce, sig } = extractAuth({ headers: req.headers, query: Object.fromEntries(url.searchParams) });
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
    const blocked = requireActiveCheck(result.device);
    if (blocked) return rejectUpgrade(socket, blocked);

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.device = result.device;
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    track(ws);
    ws.on('error', () => {});
    ws.on('message', (data, isBinary) => {
      if (!isBinary) handleText(ws, data);
    });
    ws.send(JSON.stringify({ type: 'ready', device_id: ws.device.id, server_time: nowSec() }));
    log.info('stream_open', { device_id: ws.device.id });
  });

  registry.setDeviceBlockedHook((deviceId, status) => {
    const n = closeDeviceSockets(deviceId, status);
    if (n) log.info('stream_closed_by_status', { device_id: deviceId, status, sockets: n });
  });

  return wss;
}
