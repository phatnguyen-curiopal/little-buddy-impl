import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, claimDevice, adminHeaders } from '../helpers/fixtures.js';

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

test('admin routes need the exact ADMIN_TOKEN', async () => {
  assert.equal((await api('GET', '/admin/batches')).status, 401);
  assert.equal((await api('GET', '/admin/batches', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await api('GET', '/admin/batches', { headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}x` } })).status, 401);
  const p = await registerParent(api);
  assert.equal((await api('GET', '/admin/batches', { token: p.token })).status, 401);
  assert.equal((await api('GET', '/admin/batches', { headers: adminHeaders })).status, 200);
});

test('batches list carries device and active counts', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice({ count: 3 });
  await claimDevice(api, p.token, d.claimCode);

  const res = await api('GET', '/admin/batches', { headers: adminHeaders });
  assert.equal(res.status, 200);
  const batch = res.body.batches.find((b) => b.id === d.batch.id);
  assert.equal(batch.label, d.batch.label);
  assert.equal(batch.size, 3);
  assert.equal(batch.device_count, 3);
  assert.equal(batch.active_count, 1);
});

test('device list filters by status, batch and family, and caps the limit', async () => {
  const p = await registerParent(api);
  const a = await provisionDevice({ count: 2 });
  const b = await provisionDevice({ count: 1 });
  await claimDevice(api, p.token, a.claimCode);

  const all = await api('GET', '/admin/devices', { headers: adminHeaders });
  assert.equal(all.body.devices.length, 3);
  assert.equal(all.body.devices[0].family_id !== undefined, true);

  const active = await api('GET', '/admin/devices?status=active', { headers: adminHeaders });
  assert.deepEqual(active.body.devices.map((x) => x.id), [a.id]);

  const inB = await api('GET', `/admin/devices?batch_id=${b.batch.id}`, { headers: adminHeaders });
  assert.deepEqual(inB.body.devices.map((x) => x.id), [b.id]);

  const inFamily = await api('GET', `/admin/devices?family_id=${p.familyId}`, { headers: adminHeaders });
  assert.deepEqual(inFamily.body.devices.map((x) => x.id), [a.id]);

  const paged = await api('GET', '/admin/devices?limit=1&offset=1', { headers: adminHeaders });
  assert.equal(paged.body.devices.length, 1);

  const capped = await api('GET', '/admin/devices?limit=9999', { headers: adminHeaders });
  assert.equal(capped.status, 200);

  const badStatus = await api('GET', '/admin/devices?status=weird', { headers: adminHeaders });
  assert.equal(badStatus.status, 400);
  const badBatch = await api('GET', '/admin/devices?batch_id=nope', { headers: adminHeaders });
  assert.equal(badBatch.status, 400);
});

test('force-disable, enable and revoke', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);

  const noReason = await api('POST', `/admin/devices/${d.id}/disable`, { headers: adminHeaders, body: {} });
  assert.equal(noReason.status, 400);

  const off = await api('POST', `/admin/devices/${d.id}/disable`, { headers: adminHeaders, body: { reason: 'abuse report' } });
  assert.equal(off.status, 200);
  assert.equal(off.body.device.disabled_by, 'admin');

  const on = await api('POST', `/admin/devices/${d.id}/enable`, { headers: adminHeaders });
  assert.equal(on.body.device.status, 'active');

  const badReason = await api('POST', `/admin/devices/${d.id}/revoke`, { headers: adminHeaders, body: { reason: 'meh' } });
  assert.equal(badReason.status, 400);
  const revoked = await api('POST', `/admin/devices/${d.id}/revoke`, { headers: adminHeaders, body: { reason: 'stolen' } });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.device.status, 'revoked');
  assert.equal(revoked.body.device.status_reason, 'stolen');

  const again = await api('POST', `/admin/devices/${d.id}/revoke`, { headers: adminHeaders, body: { reason: 'lost' } });
  assert.equal(again.status, 409);
  const parentView = await api('GET', '/api/devices', { token: p.token });
  assert.equal(parentView.body.devices[0].status, 'revoked');

  const missing = await api('POST', '/admin/devices/00000000-0000-4000-8000-000000000000/enable', { headers: adminHeaders });
  assert.equal(missing.status, 404);
});

test('reissue-claim-code invalidates the printed code and only works before claim', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();

  const res = await api('POST', `/admin/devices/${d.id}/reissue-claim-code`, { headers: adminHeaders });
  assert.equal(res.status, 200);
  assert.match(res.body.claim_code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const old = await api('POST', '/api/devices/claim', { token: p.token, body: { claim_code: d.claimCode } });
  assert.equal(old.status, 404);
  const claimed = await claimDevice(api, p.token, res.body.claim_code);
  assert.equal(claimed.status, 'active');

  const late = await api('POST', `/admin/devices/${d.id}/reissue-claim-code`, { headers: adminHeaders });
  assert.equal(late.status, 409);
  assert.equal(late.body.error.code, 'device_already_claimed');
});
