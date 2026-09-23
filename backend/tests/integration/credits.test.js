import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, adminHeaders } from '../helpers/fixtures.js';

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

test('a new family starts with the welcome grant', async () => {
  const p = await registerParent(api);
  const res = await api('GET', '/api/wallet', { token: p.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, 10);
  assert.equal(res.body.ledger.length, 1);
  assert.equal(res.body.ledger[0].kind, 'grant');
  assert.equal(res.body.ledger[0].reason, 'welcome');
  assert.equal(res.body.ledger[0].actor_kind, 'system');
  assert.equal(res.body.ledger[0].actor_id, undefined);
});

test('admin grants need a reason and a real family, and change the balance', async () => {
  const p = await registerParent(api);
  const noReason = await api('POST', `/admin/families/${p.familyId}/credits`, { headers: adminHeaders, body: { amount: 5 } });
  assert.equal(noReason.status, 400);
  const badAmount = await api('POST', `/admin/families/${p.familyId}/credits`, { headers: adminHeaders, body: { amount: 0, reason: 'x' } });
  assert.equal(badAmount.status, 400);
  const unknown = await api('POST', '/admin/families/00000000-0000-4000-8000-000000000000/credits', { headers: adminHeaders, body: { amount: 5, reason: 'x' } });
  assert.equal(unknown.status, 404);
  assert.equal((await api('POST', `/admin/families/${p.familyId}/credits`, { body: { amount: 5, reason: 'x' } })).status, 401);

  const ok = await api('POST', `/admin/families/${p.familyId}/credits`, { headers: adminHeaders, body: { amount: 5, reason: 'support: apology' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.balance, 15);

  const refund = await api('POST', `/admin/families/${p.familyId}/credits`, { headers: adminHeaders, body: { amount: 2, kind: 'refund', reason: 'double charge' } });
  assert.equal(refund.body.balance, 17);

  const adminView = await api('GET', `/admin/families/${p.familyId}/wallet`, { headers: adminHeaders });
  assert.equal(adminView.body.balance, 17);
  assert.deepEqual(adminView.body.ledger.map((r) => r.kind), ['refund', 'grant', 'grant']);

  const parentView = await api('GET', '/api/wallet', { token: p.token });
  assert.equal(parentView.body.balance, 17);
  assert.equal((await api('GET', '/admin/families/00000000-0000-4000-8000-000000000000/wallet', { headers: adminHeaders })).status, 404);
});

test('turns list is empty for a fresh family and needs a parent token', async () => {
  const p = await registerParent(api);
  const res = await api('GET', '/api/turns', { token: p.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.turns, []);
  assert.equal((await api('GET', '/api/turns')).status, 401);
});

test('another family cannot read this wallet', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  await api('POST', `/admin/families/${p1.familyId}/credits`, { headers: adminHeaders, body: { amount: 5, reason: 'x' } });
  assert.equal((await api('GET', '/api/wallet', { token: p2.token })).body.balance, 10);
});
