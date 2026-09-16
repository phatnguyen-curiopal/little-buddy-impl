import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalString, sign, hashBody, signRequest, EMPTY_BODY_HASH } from '../../devices/signing.js';

const fixture = JSON.parse(await readFile(new URL('../fixtures/hmac_vectors.json', import.meta.url), 'utf8'));
const secret = Buffer.from(fixture.secret_hex, 'hex');

test('empty body hash constant matches the fixture', () => {
  assert.equal(EMPTY_BODY_HASH, fixture.empty_body_sha256);
});

for (const v of fixture.vectors) {
  test(`vector: ${v.name}`, () => {
    const bodyHash = v.body === null ? EMPTY_BODY_HASH : hashBody(Buffer.from(v.body, 'utf8'));
    assert.equal(bodyHash, v.body_sha256);
    const canonical = canonicalString({
      method: v.method,
      path: v.path,
      deviceId: fixture.device_id,
      ts: fixture.ts,
      nonce: fixture.nonce,
      bodyHash,
    });
    assert.equal(canonical, v.canonical);
    assert.equal(sign(secret, canonical), v.sig);
  });
}

test('signRequest emits the header and query sets firmware would send', () => {
  const v = fixture.vectors[0];
  const signed = signRequest({
    secret,
    deviceId: fixture.device_id,
    method: 'post',
    path: v.path,
    body: Buffer.from(v.body, 'utf8'),
    ts: Number(fixture.ts),
    nonce: fixture.nonce,
  });
  assert.equal(signed.sig, v.sig);
  assert.deepEqual(signed.headers, {
    'x-lb-device': fixture.device_id,
    'x-lb-ts': fixture.ts,
    'x-lb-nonce': fixture.nonce,
    'x-lb-sig': v.sig,
  });
  assert.deepEqual(signed.query, { device_id: fixture.device_id, ts: fixture.ts, nonce: fixture.nonce, sig: v.sig });

  const ws = signRequest({ secret, deviceId: fixture.device_id, method: 'GET', path: '/v1/stream', ts: Number(fixture.ts), nonce: fixture.nonce });
  assert.equal(ws.sig, fixture.vectors[1].sig);
});
