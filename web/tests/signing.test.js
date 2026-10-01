import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EMPTY_BODY_HASH, hexToBytes, bytesToHex, newNonce, sha256Hex, canonicalString, hmacHex, signRequest } from '../src/talk/signing.js';

// The backend owns the vectors; the web toy reads them from there so its
// signer and the server's can never drift apart silently.
const fixture = JSON.parse(await readFile(new URL('../../backend/tests/fixtures/hmac_vectors.json', import.meta.url), 'utf8'));
const encode = (s) => new TextEncoder().encode(s);

test('empty body hash matches the fixture', () => {
  assert.equal(EMPTY_BODY_HASH, fixture.empty_body_sha256);
});

test('hex helpers round-trip and reject bad input', () => {
  assert.equal(bytesToHex(hexToBytes(fixture.secret_hex)), fixture.secret_hex);
  for (const bad of ['', 'abc', 'zz', 42, null]) assert.throws(() => hexToBytes(bad));
});

for (const v of fixture.vectors) {
  test(`vector: ${v.name}`, async () => {
    const bodyHash = v.body === null ? EMPTY_BODY_HASH : await sha256Hex(encode(v.body));
    assert.equal(bodyHash, v.body_sha256);
    const canonical = canonicalString({ method: v.method, path: v.path, deviceId: fixture.device_id, ts: fixture.ts, nonce: fixture.nonce, bodyHash });
    assert.equal(canonical, v.canonical);
    assert.equal(await hmacHex(hexToBytes(fixture.secret_hex), canonical), v.sig);
  });
}

test('the stream upgrade is signed into the query form the vectors expect', async () => {
  const ws = fixture.vectors.find((v) => v.path === '/v1/stream');
  const upgrade = await signRequest({ secretHex: fixture.secret_hex, deviceId: fixture.device_id, method: 'GET', path: '/v1/stream', ts: Number(fixture.ts), nonce: fixture.nonce });
  assert.equal(upgrade.sig, ws.sig);
  assert.equal(`wss://host/v1/stream?${new URLSearchParams(upgrade.query)}`, ws.url);
});

test('signRequest refuses non-string bodies and non-integer timestamps', async () => {
  await assert.rejects(signRequest({ secretHex: fixture.secret_hex, deviceId: 'x', method: 'POST', path: '/p', bodyText: { a: 1 }, ts: 1 }), TypeError);
  await assert.rejects(signRequest({ secretHex: fixture.secret_hex, deviceId: 'x', method: 'POST', path: '/p', ts: 1.5 }), TypeError);
});

test('nonces are 32 hex chars and differ', () => {
  const a = newNonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, newNonce());
});

test('the web copy is identical to the console signer below its header', async () => {
  const body = (s) => s.slice(s.indexOf('export const PROTOCOL'));
  const web = await readFile(new URL('../src/talk/signing.js', import.meta.url), 'utf8');
  const console = await readFile(new URL('../../frontend/src/signing.js', import.meta.url), 'utf8');
  assert.equal(body(web).replace(/\r\n/g, '\n'), body(console).replace(/\r\n/g, '\n'));
});
