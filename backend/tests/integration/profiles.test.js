import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice } from '../helpers/fixtures.js';
import { pool } from '../../store/db.js';

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

const claim = (p, code, profile) => api('POST', '/api/devices/claim', { token: p.token, body: profile ? { claim_code: code, profile } : { claim_code: code } });

test('all 16 personalities are seeded with the prototype temperaments', async () => {
  const r = await pool.query('SELECT code, vibe FROM personalities ORDER BY code');
  assert.equal(r.rowCount, 16);
  assert.ok(r.rows.every((row) => /^[EI][SN][TF][JP]$/.test(row.code) && row.vibe.split('\n').length >= 4));
});

test('a claim with a profile stores it and the device list shows it', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const res = await claim(p, d.claimCode, { name: ' Bin ', role: 'teacher', personality: 'infj', personality_source: 'quiz' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device.profile, { name: 'Bin', role: 'teacher', personality: 'INFJ', personality_source: 'quiz' });
  const list = await api('GET', '/api/devices', { token: p.token });
  assert.deepEqual(list.body.devices[0].profile, res.body.device.profile);
});

test('a claim without a profile gets the friendly defaults', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const res = await claim(p, d.claimCode);
  assert.deepEqual(res.body.device.profile, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default' });
});

test('a bad profile fails the claim with every field listed, and the toy stays unclaimed', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const res = await claim(p, d.claimCode, { name: '', role: 'robot', personality: 'XXXX' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details.map((x) => x.field).sort(), ['name', 'personality', 'role']);
  const again = await claim(p, d.claimCode);
  assert.equal(again.status, 200, 'the code was not consumed by the failed attempt');
});

test('the owning family can edit the profile; another family cannot', async () => {
  const p = await registerParent(api);
  const other = await registerParent(api);
  const d = await provisionDevice();
  await claim(p, d.claimCode);

  const res = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: { name: 'Mít', personality: 'ISFJ', personality_source: 'picked' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device.profile, { name: 'Mít', role: 'friend', personality: 'ISFJ', personality_source: 'picked' });

  const bad = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: { role: 'pirate' } });
  assert.equal(bad.status, 400);
  const empty = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: {} });
  assert.equal(empty.status, 400);
  const foreign = await api('PATCH', `/api/devices/${d.id}/profile`, { token: other.token, body: { name: 'Hacked' } });
  assert.equal(foreign.status, 404);

  const events = await pool.query(`SELECT event FROM device_events WHERE device_id = $1 AND event = 'profile_updated'`, [d.id]);
  assert.equal(events.rowCount, 1);
});

test('a toy that changes family starts from a fresh profile', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();
  await claim(p1, d.claimCode, { name: 'Bin', role: 'daddy', personality: 'ISTJ' });
  assert.equal((await api('DELETE', `/api/devices/${d.id}`, { token: p1.token })).status, 204);
  const res = await claim(p2, d.claimCode);
  assert.deepEqual(res.body.device.profile, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default' });
});
