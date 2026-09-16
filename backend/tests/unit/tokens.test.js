import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signAccessToken, verifyAccessToken, newRefreshToken, hashToken } from '../../auth/tokens.js';

const ids = { parentId: '11111111-1111-4111-8111-111111111111', familyId: '22222222-2222-4222-8222-222222222222' };

test('access token round-trips parent and family ids', async () => {
  const token = await signAccessToken(ids);
  assert.deepEqual(await verifyAccessToken(token), ids);
});

test('expired token is reported as token_expired', async () => {
  const token = await signAccessToken(ids, { ttlSec: -10 });
  await assert.rejects(verifyAccessToken(token), (err) => err.status === 401 && err.code === 'token_expired');
});

test('tampered payload is rejected as unauthorized', async () => {
  const token = await signAccessToken(ids);
  const [header, payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), fam: 'other' })).toString('base64url');
  await assert.rejects(verifyAccessToken(`${header}.${forged}.${sig}`), (err) => err.code === 'unauthorized');
  await assert.rejects(verifyAccessToken('not.a.jwt'), (err) => err.code === 'unauthorized');
});

test('token missing the family claim is rejected', async () => {
  const { SignJWT } = await import('jose');
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ids.parentId)
    .setIssuer('littlebuddy')
    .setAudience('dashboard')
    .setExpirationTime('5m')
    .sign(key);
  await assert.rejects(verifyAccessToken(token), (err) => err.code === 'unauthorized');
});

test('refresh tokens are 43-char base64url with a stable sha256 hash', () => {
  const { token, hash } = newRefreshToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(token), hash);
  assert.notEqual(newRefreshToken().token, token);
});
