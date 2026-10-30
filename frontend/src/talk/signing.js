// The browser Buddy's sign-in, in WebCrypto. backend-v2 opens every toy
// connection with a challenge; the toy answers with an HMAC of the server's
// own nonce and clock, so a wrong laptop clock never matters and the secret
// never travels. A mirror of signChallenge in backend-v2's
// src/devices/credentials.ts: tests/signing.test.js pins the two together.
// No window or DOM access: it runs unchanged under node --test.
//
//   signature = base64url(HMAC-SHA256(secret, `${nonce}.${device_id}.${server_time}`))

const encoder = new TextEncoder();

// Throws on anything that is not base64url, so a damaged credential is
// dropped and fetched again instead of failing every sign-in.
export function b64urlToBytes(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length % 4 === 1 || /[^A-Za-z0-9_-]/.test(text)) {
    throw new Error('expected a base64url string');
  }
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// Unpadded, as Node's base64url digest is: the server compares strings.
export function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signHello(secretB64url, nonce, deviceId, serverTime) {
  if (typeof nonce !== 'string' || !nonce) throw new TypeError('nonce must be a non-empty string');
  if (typeof deviceId !== 'string' || !deviceId) throw new TypeError('deviceId must be a non-empty string');
  // The server signs its clock as it printed it; any reformatting (a float,
  // an exponent) would sign different text.
  if (!Number.isSafeInteger(serverTime)) throw new TypeError('serverTime must be an integer (unix seconds)');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is not available here');
  const key = await subtle.importKey('raw', b64urlToBytes(secretB64url), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await subtle.sign('HMAC', key, encoder.encode(`${nonce}.${deviceId}.${serverTime}`));
  return bytesToB64url(new Uint8Array(mac));
}
