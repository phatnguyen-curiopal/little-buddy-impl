import { createHash, createHmac, randomBytes } from 'node:crypto';

// The pure half of device authentication: what both the server verifier and
// the simulated device (and, in C, the firmware) compute. Nothing here
// touches a store, so the test vectors pin it byte for byte.
//
//   canonical = "LB1\n" METHOD "\n" PATH "\n" device_id "\n" ts "\n" nonce "\n" sha256hex(body)
//   sig       = hex(HMAC-SHA256(secret, canonical))
//
// PATH carries no host and no query string: on the WebSocket upgrade the
// signature itself travels in the query, so the query cannot be signed.
export const PROTOCOL = 'LB1';
export const EMPTY_BODY_HASH = createHash('sha256').update('').digest('hex');
export const NONCE_RE = /^[0-9a-f]{32}$/;
export const SIG_RE = /^[0-9a-f]{64}$/;

export function hashBody(body) {
  return createHash('sha256').update(body ?? '').digest('hex');
}

export function canonicalString({ method, path, deviceId, ts, nonce, bodyHash }) {
  return [PROTOCOL, String(method).toUpperCase(), path, deviceId, String(ts), nonce, bodyHash].join('\n');
}

export function sign(secret, canonical) {
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function newNonce() {
  return randomBytes(16).toString('hex');
}

// Produces the exact header set (and the equivalent query parameters for a
// WebSocket upgrade) that firmware would send.
export function signRequest({ secret, deviceId, method, path, body, ts = Math.floor(Date.now() / 1000), nonce = newNonce() }) {
  const bodyHash = body === undefined ? EMPTY_BODY_HASH : hashBody(body);
  const canonical = canonicalString({ method, path, deviceId, ts, nonce, bodyHash });
  const sig = sign(secret, canonical);
  return {
    headers: { 'x-lb-device': deviceId, 'x-lb-ts': String(ts), 'x-lb-nonce': nonce, 'x-lb-sig': sig },
    query: { device_id: deviceId, ts: String(ts), nonce, sig },
    canonical,
    sig,
    bodyHash,
    ts,
    nonce,
  };
}
