import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, claimDevice, adminHeaders, simFor } from '../helpers/fixtures.js';
import { attachStream } from '../../ws/stream.js';
import * as registry from '../../devices/registry.js';
import { SimDevice } from '../../devices/sim_client.js';
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

const reveal = (p, id) => api('POST', `/api/devices/${id}/secret`, { token: p.token });

test('/api/me says the web toy is on', async () => {
  const p = await registerParent(api);
  const me = await api('GET', '/api/me', { token: p.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.web_toy, true);
});

test('the owner gets a web credential for an active toy (not the factory secret), uncached, stamped and logged', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);

  const res = await reveal(p, d.id);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['device_id', 'secret_hex']);
  assert.equal(res.body.device_id, d.id);
  assert.match(res.body.secret_hex, /^[0-9a-f]{64}$/);
  assert.notEqual(res.body.secret_hex, d.secretHex, 'the factory secret never reaches a browser');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal((await reveal(p, d.id)).body.secret_hex, res.body.secret_hex, 'stable for one ownership');

  const row = await pool.query('SELECT secret_revealed_at FROM devices WHERE id = $1', [d.id]);
  assert.ok(row.rows[0].secret_revealed_at);
  const events = await pool.query(`SELECT actor_kind, actor_id FROM device_events WHERE device_id = $1 AND event = 'secret_revealed'`, [d.id]);
  // Two reveals above, one event each.
  const byParent = { actor_kind: 'parent', actor_id: p.parentId };
  assert.deepEqual(events.rows, [byParent, byParent]);
  const admin = await api('GET', `/admin/devices?family_id=${p.familyId}`, { headers: adminHeaders });
  assert.ok(admin.body.devices[0].secret_revealed_at, 'the operator sees that a web credential exists');

  // The revealed secret is a working device credential.
  const sim = new SimDevice({ deviceId: res.body.device_id, secretHex: res.body.secret_hex, baseUrl: srv.baseUrl });
  const { ws } = await sim.openStream();
  assert.equal((await sim.turnStart(ws)).type, 'turn_accepted');
  await new Promise((resolve) => { ws.once('close', resolve); ws.close(); });
});

test('another family, a paused toy, an unclaimed toy and a junk id are all the same 404', async () => {
  const p = await registerParent(api);
  const other = await registerParent(api);
  const d = await provisionDevice();
  const unclaimed = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);

  for (const [who, id] of [[other, d.id], [p, unclaimed.id], [p, 'not-a-uuid'], [p, '00000000-0000-4000-8000-000000000000']]) {
    const res = await reveal(who, id);
    assert.equal(res.status, 404, id);
    assert.equal(res.body.error.code, 'device_not_found');
  }
  await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: {} });
  const paused = await reveal(p, d.id);
  assert.equal(paused.status, 404);
  assert.equal(paused.body.error.code, 'device_not_found');
  const row = await pool.query('SELECT secret_revealed_at FROM devices WHERE id = $1', [d.id]);
  assert.equal(row.rows[0].secret_revealed_at, null, 'no refused reveal stamps the toy');
  assert.equal((await api('POST', `/api/devices/${d.id}/secret`, {})).status, 401);
});

test('reveals are rate limited per parent', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);
  for (let i = 0; i < 30; i += 1) assert.equal((await reveal(p, d.id)).status, 200);
  const limited = await reveal(p, d.id);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('rotating the secret clears the reveal marker', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);
  const first = await reveal(p, d.id);
  await registry.rotateSecret({ deviceId: d.id });
  const row = await pool.query('SELECT secret_revealed_at FROM devices WHERE id = $1', [d.id]);
  assert.equal(row.rows[0].secret_revealed_at, null);
  const stale = await simFor({ id: d.id, secretHex: first.body.secret_hex }, srv.baseUrl);
  assert.equal((await stale.heartbeat()).status, 401, 'rotation kills the web credential derived from the old secret');
  const fresh = await reveal(p, d.id);
  assert.notEqual(fresh.body.secret_hex, first.body.secret_hex);
  const sim = await simFor({ id: d.id, secretHex: fresh.body.secret_hex }, srv.baseUrl);
  assert.equal((await sim.heartbeat()).status, 200);
});

test('a former owner cannot sign as the toy after unpair, a new owner claim, or even its own re-claim', async () => {
  const oldOwner = await registerParent(api);
  const newOwner = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, oldOwner.token, d.claimCode);
  const kept = (await reveal(oldOwner, d.id)).body.secret_hex;
  const web = () => simFor({ id: d.id, secretHex: kept }, srv.baseUrl);
  const physical = await simFor(d, srv.baseUrl);

  // Paused by its owner, the web toy still connects so the page can show why.
  await api('POST', `/api/devices/${d.id}/disable`, { token: oldOwner.token, body: {} });
  assert.equal((await (await web()).heartbeat()).status, 200);
  await api('POST', `/api/devices/${d.id}/enable`, { token: oldOwner.token, body: {} });

  assert.equal((await api('DELETE', `/api/devices/${d.id}`, { token: oldOwner.token })).status, 204);
  const unpaired = await (await web()).heartbeat();
  assert.equal(unpaired.status, 401);
  assert.equal(unpaired.body.error.code, 'auth_bad_signature');
  const row = await pool.query('SELECT secret_revealed_at FROM devices WHERE id = $1', [d.id]);
  assert.equal(row.rows[0].secret_revealed_at, null, 'unpair clears the reveal marker');

  await claimDevice(api, newOwner.token, d.claimCode);
  assert.equal((await (await web()).heartbeat()).status, 401, 'no key into the new family');
  const stream = await (await web()).openStream().then(({ ws }) => { ws.close(); return 'opened'; }, (err) => err.status);
  assert.equal(stream, 401);
  // Before the new family reveals, no web credential verifies at all.
  const newKey = (await reveal(newOwner, d.id)).body.secret_hex;
  assert.notEqual(newKey, kept);
  assert.equal((await (await simFor({ id: d.id, secretHex: newKey }, srv.baseUrl)).heartbeat()).status, 200);
  assert.equal((await physical.heartbeat()).status, 200, 'the physical toy keeps its factory secret');

  // Back to the first family: a fresh claim means a fresh credential.
  await api('DELETE', `/api/devices/${d.id}`, { token: newOwner.token });
  await claimDevice(api, oldOwner.token, d.claimCode);
  assert.equal((await (await web()).heartbeat()).status, 401);
  assert.equal((await (await simFor({ id: d.id, secretHex: newKey }, srv.baseUrl)).heartbeat()).status, 401);
});

test('a web credential does not verify before the owner reveals it', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);
  const { webToySecret } = await import('../../devices/secret_box.js');
  const row = await pool.query('SELECT family_id, claimed_at FROM devices WHERE id = $1', [d.id]);
  const derived = webToySecret(d.secret, { familyId: row.rows[0].family_id, claimedAt: row.rows[0].claimed_at });
  const sim = await simFor({ id: d.id, secretHex: derived.toString('hex') }, srv.baseUrl);
  assert.equal((await sim.heartbeat()).status, 401);
  const res = await reveal(p, d.id);
  assert.equal(res.body.secret_hex, derived.toString('hex'));
  assert.equal((await sim.heartbeat()).status, 200);
});
