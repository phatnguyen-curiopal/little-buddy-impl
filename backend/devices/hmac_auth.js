import { timingSafeEqual } from 'node:crypto';
import config from '../config.js';
import redis from '../store/redis.js';
import * as registry from './registry.js';
import { canonicalString, sign, EMPTY_BODY_HASH, NONCE_RE, SIG_RE } from './signing.js';
import { isUuid } from '../lib/validate.js';
import log from '../lib/log.js';

// One verifier for both callers: the Express middleware on /v1/* and the
// WebSocket upgrade on /v1/stream. Returns a result object instead of
// throwing so each caller can render the rejection its own way.
//
// Order is cheap-first, nonce-last: shape and timestamp checks cost nothing,
// the failure counter keeps a spray away from the database, and the nonce is
// only written after the signature verifies so junk cannot fill Redis or
// pre-burn a device's nonces.

const TS_RE = /^\d{1,12}$/;
const FAIL_WINDOW_SEC = 60;
// Per-ip limit for ids that do not exist, so a spray of random ids costs at
// most this many database lookups per minute.
const UNKNOWN_IP_LIMIT = 60;

export const nowSec = () => Math.floor(Date.now() / 1000);

const fail = (http, code, message) => ({ ok: false, http, code, message });

// Headers first (HTTP), then query parameters (WebSocket upgrade, where most
// embedded clients cannot set headers).
export function extractAuth({ headers = {}, query = {} }) {
  const pick = (header, param) => {
    const h = headers[header];
    if (typeof h === 'string' && h !== '') return h;
    const q = query[param];
    return typeof q === 'string' ? q : undefined;
  };
  return {
    deviceId: pick('x-lb-device', 'device_id'),
    ts: pick('x-lb-ts', 'ts'),
    nonce: pick('x-lb-nonce', 'nonce'),
    sig: pick('x-lb-sig', 'sig'),
  };
}

function safeEqualHex(a, b) {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function failuresFor(key) {
  const n = await redis.get(`dev:fail:${key}`);
  return Number(n) || 0;
}

async function recordFailure(keys) {
  const m = redis.multi();
  for (const key of keys) m.incr(`dev:fail:${key}`).expire(`dev:fail:${key}`, FAIL_WINDOW_SEC, 'NX');
  await m.exec().catch(() => {});
}

function authorize(device, auth) {
  const withAuth = Object.freeze({ ...device, auth: Object.freeze(auth) });
  if (device.status === registry.STATUS.REVOKED) {
    return { ...fail(403, 'device_revoked', 'device has been revoked'), device: withAuth };
  }
  return { ok: true, device: withAuth };
}

export async function verifyDeviceRequest({ method, path, deviceId, ts, nonce, sig, bodyHash = EMPTY_BODY_HASH, ip = null, now = nowSec() }) {
  if (config.deviceAuth === 'off') {
    // Development only (config refuses this in production). Signature checks
    // are skipped, but the device must still exist so every status rule
    // behaves exactly as it will with auth on.
    if (!isUuid(deviceId)) return fail(401, 'auth_missing', 'X-LB-Device header is required');
    const device = await registry.getById(deviceId.toLowerCase());
    if (!device) return fail(401, 'auth_unknown_device', 'device is not registered');
    return authorize(device, { mode: 'off', ts: null, nonce: null });
  }

  if (!isUuid(deviceId) || !TS_RE.test(String(ts)) || !NONCE_RE.test(String(nonce)) || !SIG_RE.test(String(sig))) {
    return fail(401, 'auth_missing', 'missing or malformed device auth values');
  }
  const id = deviceId.toLowerCase();
  const tsNum = Number(ts);
  if (Math.abs(now - tsNum) > config.deviceClockSkewSec) {
    return fail(401, 'auth_ts_skew', 'timestamp is outside the accepted window; resync from server_time');
  }

  // Devices fail closed when Redis is down: without the nonce store a replay
  // would be accepted, and an accepted turn spends money.
  let overLimit;
  try {
    const [byDevice, byIp] = await Promise.all([failuresFor(`id:${id}`), ip ? failuresFor(`ip:${ip}`) : 0]);
    overLimit = byDevice >= config.deviceAuthFailLimit || byIp >= UNKNOWN_IP_LIMIT;
  } catch {
    return fail(503, 'auth_unavailable', 'authentication is temporarily unavailable');
  }
  if (overLimit) return fail(429, 'rate_limited', 'too many failed authentications');

  const found = await registry.getForAuth(id);
  if (!found) {
    await recordFailure([`id:${id}`, ...(ip ? [`ip:${ip}`] : [])]);
    log.warn('device_auth_failed', { device_id: id, code: 'auth_unknown_device' });
    return fail(401, 'auth_unknown_device', 'device is not registered');
  }

  const canonical = canonicalString({ method, path, deviceId: id, ts, nonce, bodyHash });
  let match = safeEqualHex(sign(found.secret, canonical), sig);
  if (!match && found.prevSecret) match = safeEqualHex(sign(found.prevSecret, canonical), sig);
  // The web toy's ownership-scoped credential (registry.revealSecret).
  if (!match && found.webSecret) match = safeEqualHex(sign(found.webSecret, canonical), sig);
  if (!match) {
    await recordFailure([`id:${id}`]);
    log.warn('device_auth_failed', { device_id: id, code: 'auth_bad_signature' });
    return fail(401, 'auth_bad_signature', 'signature does not match');
  }

  let stored;
  try {
    stored = await redis.set(`dev:nonce:${id}:${nonce}`, '1', 'EX', config.deviceNonceTtlSec, 'NX');
  } catch {
    return fail(503, 'auth_unavailable', 'authentication is temporarily unavailable');
  }
  if (stored !== 'OK') {
    await recordFailure([`id:${id}`]);
    log.warn('device_auth_failed', { device_id: id, code: 'auth_replay' });
    return fail(401, 'auth_replay', 'nonce was already used');
  }

  return authorize(found.device, { mode: 'hmac', ts: tsNum, nonce });
}

// Routes that spend money (stream, later ask) need an active device. A
// provisioned or disabled device can still heartbeat so its screen can say
// why it is quiet.
export function requireActiveCheck(device) {
  switch (device.status) {
    case registry.STATUS.ACTIVE:
      return null;
    case registry.STATUS.PROVISIONED:
      return fail(403, 'device_not_claimed', 'device has not been claimed by a family yet');
    case registry.STATUS.DISABLED:
      return fail(403, 'device_disabled', 'device is disabled');
    default:
      return fail(403, 'device_revoked', 'device has been revoked');
  }
}
