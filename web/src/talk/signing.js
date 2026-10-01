// The LB1 device signer, in WebCrypto. A byte-for-byte copy of
// frontend/src/signing.js (itself a mirror of backend/devices/signing.js):
// the web toy signs /v1 exactly as firmware does, and tests/signing.test.js
// pins it to the backend's reference vectors so the copies cannot drift.
// No window or DOM access: it runs unchanged under node --test.
//
//   canonical = "LB1\n" METHOD "\n" PATH "\n" device_id "\n" ts "\n" nonce "\n" sha256hex(body)
//   sig       = hex(HMAC-SHA256(secret, canonical))

export const PROTOCOL = 'LB1';
export const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

// Throws on a bad paste so the toy lane can say "that is not a secret"
// before a single request burns the device's failure budget.
export function hexToBytes(hex) {
  if (typeof hex !== 'string' || hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('expected an even-length hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newNonce() {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function sha256Hex(bytes) {
  return bytesToHex(new Uint8Array(await subtle.digest('SHA-256', bytes)));
}

export function canonicalString({ method, path, deviceId, ts, nonce, bodyHash }) {
  return [PROTOCOL, String(method).toUpperCase(), path, deviceId, String(ts), nonce, bodyHash].join('\n');
}

export async function hmacHex(secretBytes, text) {
  const key = await subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(new Uint8Array(await subtle.sign('HMAC', key, encoder.encode(text))));
}

// bodyText must be the exact string that will be sent: the caller builds it
// once with JSON.stringify and hands the same string to fetch. Passing an
// object here is refused so "hash one thing, send another" cannot happen.
export async function signRequest({ secretHex, deviceId, method, path, bodyText, ts, nonce = newNonce() }) {
  if (bodyText !== undefined && typeof bodyText !== 'string') throw new TypeError('bodyText must be a string');
  if (!Number.isInteger(ts)) throw new TypeError('ts must be an integer (unix seconds)');
  const bodyHash = bodyText === undefined ? EMPTY_BODY_HASH : await sha256Hex(encoder.encode(bodyText));
  const canonical = canonicalString({ method, path, deviceId, ts, nonce, bodyHash });
  const sig = await hmacHex(hexToBytes(secretHex), canonical);
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
