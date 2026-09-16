import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, PASSWORD } from '../helpers/fixtures.js';

let srv;
let api;

before(async () => {
  await setupDb();
  srv = await startTestServer();
  api = srv.api;
});

beforeEach(async () => {
  await resetDb();
  await resetRedis();
});

after(async () => {
  await srv.close();
  await teardownDb();
});

test('register returns tokens, parent and family, and /me works', async () => {
  const p = await registerParent(api, { display_name: 'Mom' });
  assert.equal(p.parent.role, 'owner');
  assert.equal(p.parent.display_name, 'Mom');
  assert.equal(p.family.name, 'Test Family');
  assert.equal(p.expires_in, 900);
  assert.match(p.refresh_token, /^[A-Za-z0-9_-]{43}$/);

  const me = await api('GET', '/api/me', { token: p.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.parent.id, p.parentId);
  assert.equal(me.body.family.id, p.familyId);
  assert.equal(me.body.parent.password_hash, undefined);
});

test('register: duplicate email is 409, bad input is 400 with details', async () => {
  const p = await registerParent(api);
  const dup = await api('POST', '/api/auth/register', {
    body: { email: p.email.toUpperCase(), password: PASSWORD, family_name: 'Other' },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'email_taken');

  const short = await api('POST', '/api/auth/register', {
    body: { email: 'x@y.z', password: '1234567', family_name: 'F' },
  });
  assert.equal(short.status, 400);
  assert.equal(short.body.error.code, 'validation_error');
  assert.deepEqual(short.body.error.details.map((d) => d.field), ['password']);

  const bad = await api('POST', '/api/auth/register', { body: { email: 'not-an-email', password: PASSWORD } });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((d) => d.field).sort(), ['email', 'family_name']);
});

test('login succeeds with the right password and case-insensitive email', async () => {
  const p = await registerParent(api);
  const res = await api('POST', '/api/auth/login', { body: { email: p.email.toUpperCase(), password: PASSWORD } });
  assert.equal(res.status, 200);
  assert.equal(res.body.parent.id, p.parentId);
  assert.ok(res.body.access_token);
  assert.notEqual(res.body.refresh_token, p.refresh_token);
});

test('wrong password and unknown email produce identical 401 bodies', async () => {
  const p = await registerParent(api);
  const wrong = await api('POST', '/api/auth/login', { body: { email: p.email, password: 'wrong password' } });
  const unknown = await api('POST', '/api/auth/login', { body: { email: 'nobody@test.local', password: PASSWORD } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(wrong.body.error.code, 'invalid_credentials');
});

test('/me rejects missing, malformed and tampered tokens', async () => {
  const p = await registerParent(api);
  assert.equal((await api('GET', '/api/me')).status, 401);
  assert.equal((await api('GET', '/api/me', { headers: { authorization: 'Basic abc' } })).status, 401);
  const tampered = p.token.slice(0, -2) + 'xx';
  const res = await api('GET', '/api/me', { token: tampered });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'unauthorized');
});

test('refresh rotates the token; the old one is rejected and its reuse revokes the chain', async () => {
  const p = await registerParent(api);
  const first = await api('POST', '/api/auth/refresh', { body: { refresh_token: p.refresh_token } });
  assert.equal(first.status, 200);
  assert.ok(first.body.access_token);
  assert.notEqual(first.body.refresh_token, p.refresh_token);

  const replay = await api('POST', '/api/auth/refresh', { body: { refresh_token: p.refresh_token } });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'refresh_token_reused');

  // The replay revoked everything, including the token that was still valid.
  const collateral = await api('POST', '/api/auth/refresh', { body: { refresh_token: first.body.refresh_token } });
  assert.equal(collateral.status, 401);
  assert.equal(collateral.body.error.code, 'refresh_token_reused');

  const garbage = await api('POST', '/api/auth/refresh', { body: { refresh_token: 'nope' } });
  assert.equal(garbage.body.error.code, 'invalid_refresh_token');
});

test('logout revokes the refresh token and is idempotent', async () => {
  const p = await registerParent(api);
  assert.equal((await api('POST', '/api/auth/logout', { body: { refresh_token: p.refresh_token } })).status, 204);
  assert.equal((await api('POST', '/api/auth/logout', { body: { refresh_token: p.refresh_token } })).status, 204);
  assert.equal((await api('POST', '/api/auth/logout', { body: { refresh_token: 'unknown' } })).status, 204);
  const res = await api('POST', '/api/auth/refresh', { body: { refresh_token: p.refresh_token } });
  assert.equal(res.status, 401);
});

test('login is rate limited per ip and email after 10 failures', async () => {
  const p = await registerParent(api);
  for (let i = 0; i < 10; i += 1) {
    const res = await api('POST', '/api/auth/login', { body: { email: p.email, password: 'wrong' } });
    assert.equal(res.status, 401, `attempt ${i + 1}`);
  }
  const blocked = await api('POST', '/api/auth/login', { body: { email: p.email, password: PASSWORD } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'rate_limited');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  // A different email from the same ip is a different bucket.
  const other = await api('POST', '/api/auth/login', { body: { email: 'other@test.local', password: PASSWORD } });
  assert.equal(other.status, 401);
});

test('invalid JSON is 400 invalid_json and an oversized body is 413', async () => {
  const bad = await api('POST', '/api/auth/login', { raw: '{not json', headers: { 'content-type': 'application/json' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'invalid_json');

  const big = await api('POST', '/api/auth/login', {
    raw: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(70_000) }),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(big.status, 413);
  assert.equal(big.body.error.code, 'payload_too_large');
});
