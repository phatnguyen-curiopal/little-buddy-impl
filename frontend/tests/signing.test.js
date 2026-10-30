import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { b64urlToBytes, bytesToB64url, signHello } from '../src/talk/signing.js';

// The browser Buddy must sign exactly what backend-v2 verifies, so the test
// asks backend-v2's own signChallenge. Node strips the TypeScript types
// itself from 23.6 on; an older Node cannot load the .ts file, and then the
// same HMAC from node:crypto stands in.
const backend = await import('../../backend-v2/src/devices/credentials.ts').catch(() => null);
const reference = backend
  ? (secret, nonce, deviceId, serverTime) => backend.signChallenge(Buffer.from(secret, 'base64url'), nonce, deviceId, serverTime)
  : (secret, nonce, deviceId, serverTime) => createHmac('sha256', Buffer.from(secret, 'base64url')).update(`${nonce}.${deviceId}.${serverTime}`).digest('base64url');

const secretOf = (fill) => Buffer.alloc(32, fill).toString('base64url');

// A credential is base64url of 32 bytes; the nonce is the server's
// randomToken(16); server_time is unix seconds.
const VECTORS = [
  { name: 'all-zero secret', secret: secretOf(0), nonce: 'AAAAAAAAAAAAAAAAAAAAAA', deviceId: '00000000-0000-4000-8000-000000000000', serverTime: 0 },
  { name: 'typical challenge', secret: secretOf(7), nonce: 'q1w2e3r4t5y6u7i8o9p0Aa', deviceId: '3f2b6a1e-9c4d-4e8f-a1b2-c3d4e5f60718', serverTime: 1_761_800_000 },
  { name: 'secret with - and _ in it', secret: Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 37 + 251) % 256)).toString('base64url'), nonce: 'Zz_-09azAZ', deviceId: 'ffffffff-ffff-4fff-bfff-ffffffffffff', serverTime: 4_102_444_800 },
];

test('the reference is backend-v2 itself when this Node can load it', { skip: backend ? false : 'this Node cannot load .ts; compared with node:crypto instead' }, () => {
  assert.equal(typeof backend.signChallenge, 'function');
});

for (const v of VECTORS) {
  test(`signs the challenge as backend-v2 does: ${v.name}`, async () => {
    const sig = await signHello(v.secret, v.nonce, v.deviceId, v.serverTime);
    assert.equal(sig, reference(v.secret, v.nonce, v.deviceId, v.serverTime));
    assert.match(sig, /^[A-Za-z0-9_-]{43}$/, 'unpadded base64url of 32 bytes');
  });
}

test('every part of the challenge is signed', async () => {
  const v = VECTORS[1];
  const base = await signHello(v.secret, v.nonce, v.deviceId, v.serverTime);
  assert.notEqual(await signHello(secretOf(8), v.nonce, v.deviceId, v.serverTime), base, 'secret');
  assert.notEqual(await signHello(v.secret, `${v.nonce}x`, v.deviceId, v.serverTime), base, 'nonce');
  assert.notEqual(await signHello(v.secret, v.nonce, VECTORS[0].deviceId, v.serverTime), base, 'device id');
  assert.notEqual(await signHello(v.secret, v.nonce, v.deviceId, v.serverTime + 1), base, 'server time');
});

test('base64url round-trips, without padding', () => {
  for (const len of [0, 1, 2, 3, 31, 32, 33]) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 101 + 7) % 256);
    const text = bytesToB64url(bytes);
    assert.doesNotMatch(text, /[=+/]/);
    assert.equal(text, Buffer.from(bytes).toString('base64url'));
    if (len) assert.deepEqual([...b64urlToBytes(text)], [...bytes]);
  }
});

test('a damaged secret or challenge is refused before anything is signed', async () => {
  for (const bad of ['', 'abc$', 'a', 'has space', 42, null, undefined]) assert.throws(() => b64urlToBytes(bad), `secret ${String(bad)}`);
  const v = VECTORS[1];
  await assert.rejects(signHello('not base64url!', v.nonce, v.deviceId, v.serverTime));
  await assert.rejects(signHello(v.secret, '', v.deviceId, v.serverTime), TypeError);
  await assert.rejects(signHello(v.secret, v.nonce, '', v.serverTime), TypeError);
  for (const time of [1.5, '1761800000', NaN, null]) await assert.rejects(signHello(v.secret, v.nonce, v.deviceId, time), TypeError, `server time ${String(time)}`);
});
