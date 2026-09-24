import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, claimDevice, simFor } from '../helpers/fixtures.js';
import { attachStream } from '../../ws/stream.js';
import * as ledgerStore from '../../store/ledger.js';
import { pool } from '../../store/db.js';

let srv;
let api;

before(async () => {
  await setupDb();
  srv = await startTestServer({ attach: attachStream });
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

const buy = (p, body) => api('POST', '/api/purchases', { token: p.token, body });
const pay = (p, id, outcome = 'success') => api('POST', `/api/purchases/${id}/demo-pay`, { token: p.token, body: { outcome } });

test('packs are listed in order with credits and price', async () => {
  const p = await registerParent(api);
  const res = await api('GET', '/api/credit-packs', { token: p.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.packs.map((x) => [x.id, x.credits, x.currency]), [['starter', 20, 'VND'], ['family', 60, 'VND'], ['big', 150, 'VND']]);
  const anonymous = await api('GET', '/api/credit-packs');
  assert.equal(anonymous.status, 200, 'the price list is public for the marketing site');
  assert.equal(anonymous.body.packs.length, 3);
});

test('create is pending and adds nothing; pay adds the pack once', async () => {
  const p = await registerParent(api);
  const created = await buy(p, { pack_id: 'starter' });
  assert.equal(created.status, 201);
  assert.equal(created.body.purchase.status, 'pending');
  assert.equal(created.body.purchase.credits, 20);
  assert.equal(created.body.purchase.price_amount, 49000);
  assert.equal((await api('GET', '/api/wallet', { token: p.token })).body.balance, 10);

  const paid = await pay(p, created.body.purchase.id);
  assert.equal(paid.status, 200);
  assert.equal(paid.body.purchase.status, 'paid');
  assert.ok(paid.body.purchase.paid_at);
  assert.equal(paid.body.balance, 30);

  const again = await pay(p, created.body.purchase.id);
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'purchase_not_pending');

  const wallet = await api('GET', '/api/wallet', { token: p.token });
  assert.equal(wallet.body.balance, 30);
  const row = wallet.body.ledger[0];
  assert.deepEqual([row.kind, row.delta, row.purchase_id, row.reason, row.actor_kind], ['purchase', 20, created.body.purchase.id, 'pack:starter', 'parent']);

  const list = await api('GET', '/api/purchases', { token: p.token });
  assert.deepEqual(list.body.purchases.map((x) => x.status), ['paid']);
});

test('a declined payment fails the purchase and adds nothing, for good', async () => {
  const p = await registerParent(api);
  const { body } = await buy(p, { pack_id: 'family' });
  const declined = await pay(p, body.purchase.id, 'decline');
  assert.equal(declined.status, 200);
  assert.equal(declined.body.purchase.status, 'failed');
  assert.equal(declined.body.purchase.failure_reason, 'card_declined');
  assert.equal(declined.body.balance, 10);
  assert.equal((await pay(p, body.purchase.id)).status, 409);
  assert.equal((await api('GET', '/api/wallet', { token: p.token })).body.balance, 10);
});

test('concurrent confirmations of one purchase add credits exactly once', async () => {
  const p = await registerParent(api);
  const { body } = await buy(p, { pack_id: 'big' });
  const results = await Promise.all([pay(p, body.purchase.id), pay(p, body.purchase.id), pay(p, body.purchase.id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
  assert.equal((await api('GET', '/api/wallet', { token: p.token })).body.balance, 160);
  const rows = await pool.query(`SELECT count(*)::int AS n FROM credit_ledger WHERE kind = 'purchase'`);
  assert.equal(rows.rows[0].n, 1);
});

test('idempotency key returns the same pending purchase; reused for another pack is 409', async () => {
  const p = await registerParent(api);
  const first = await buy(p, { pack_id: 'starter', idempotency_key: 'k-1' });
  const second = await buy(p, { pack_id: 'starter', idempotency_key: 'k-1' });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.purchase.id, first.body.purchase.id);
  const other = await buy(p, { pack_id: 'big', idempotency_key: 'k-1' });
  assert.equal(other.status, 409);
  assert.equal(other.body.error.code, 'idempotency_key_reused');
});

test('unknown pack is 404; another family cannot pay my purchase', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  assert.equal((await buy(p1, { pack_id: 'nope' })).status, 404);
  assert.equal((await buy(p1, {})).status, 400);
  const { body } = await buy(p1, { pack_id: 'starter' });
  const foreign = await pay(p2, body.purchase.id);
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.error.code, 'purchase_not_found');
  assert.equal((await pay(p1, 'not-a-uuid')).status, 404);
  assert.equal((await api('GET', '/api/wallet', { token: p1.token })).body.balance, 10);
});

test('an out-of-credit toy is sleepy until the family buys a pack, then it answers', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);
  await ledgerStore.insert(pool, { familyId: p.familyId, kind: 'expiry', delta: -10, actorKind: 'system', reason: 'test' });
  const sim = await simFor(d, srv.baseUrl);
  const { ws } = await sim.openStream();

  const denied = await sim.turnStart(ws);
  assert.equal(denied.type, 'turn_denied');
  assert.equal(denied.emotion, 'sleepy');

  const { body } = await buy(p, { pack_id: 'starter' });
  await pay(p, body.purchase.id);

  const accepted = await sim.turnStart(ws);
  assert.equal(accepted.type, 'turn_accepted');
  const { done } = await sim.turnEnd(ws);
  assert.equal(done.status, 'completed');
  assert.equal((await api('GET', '/api/wallet', { token: p.token })).body.balance, 19);
  await new Promise((resolve) => { ws.once('close', resolve); ws.close(); });
});
