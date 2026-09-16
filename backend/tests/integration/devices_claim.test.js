import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, createChild, provisionDevice, claimDevice, adminHeaders } from '../helpers/fixtures.js';

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

test('claim binds the toy to the family and child; the DTO leaks no secrets', async () => {
  const p = await registerParent(api);
  const child = await createChild(api, p.token);
  const d = await provisionDevice();

  const res = await api('POST', '/api/devices/claim', { token: p.token, body: { claim_code: d.claimCode.toLowerCase(), child_id: child.id } });
  assert.equal(res.status, 200);
  const device = res.body.device;
  assert.equal(device.id, d.id);
  assert.equal(device.serial, d.serial);
  assert.equal(device.status, 'active');
  assert.equal(device.child_id, child.id);
  assert.ok(device.claimed_at);
  for (const key of ['secret', 'secret_enc', 'secret_hex', 'claim_code', 'claim_code_hash', 'family_id']) {
    assert.equal(device[key], undefined, key);
  }

  const list = await api('GET', '/api/devices', { token: p.token });
  assert.deepEqual(list.body.devices.map((x) => x.id), [d.id]);
});

test('claim failures: unknown code 404, consumed code 404, bad format 400, other family child 404', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();

  const unknown = await api('POST', '/api/devices/claim', { token: p1.token, body: { claim_code: 'ABCD-EFGH' } });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'claim_code_invalid');

  const bad = await api('POST', '/api/devices/claim', { token: p1.token, body: { claim_code: 'ABCD-EFG0' } });
  assert.equal(bad.status, 400);

  const childOfP2 = await createChild(api, p2.token);
  const wrongChild = await api('POST', '/api/devices/claim', { token: p1.token, body: { claim_code: d.claimCode, child_id: childOfP2.id } });
  assert.equal(wrongChild.status, 404);
  assert.equal(wrongChild.body.error.code, 'child_not_found');

  await claimDevice(api, p1.token, d.claimCode);
  const consumed = await api('POST', '/api/devices/claim', { token: p2.token, body: { claim_code: d.claimCode } });
  assert.equal(consumed.status, 404);
  assert.equal(consumed.body.error.code, 'claim_code_invalid');
  assert.deepEqual(consumed.body, unknown.body);
});

test('a family only sees and touches its own devices', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p1.token, d.claimCode);

  assert.deepEqual((await api('GET', '/api/devices', { token: p2.token })).body.devices, []);
  for (const [method, path] of [
    ['POST', `/api/devices/${d.id}/disable`],
    ['POST', `/api/devices/${d.id}/enable`],
    ['PATCH', `/api/devices/${d.id}`],
    ['DELETE', `/api/devices/${d.id}`],
  ]) {
    const res = await api(method, path, { token: p2.token, body: { child_id: null } });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.equal(res.body.error.code, 'device_not_found');
  }
  const notUuid = await api('POST', '/api/devices/not-a-uuid/disable', { token: p1.token, body: {} });
  assert.equal(notUuid.status, 404);
});

test('PATCH reassigns the child or clears it', async () => {
  const p = await registerParent(api);
  const a = await createChild(api, p.token, { name: 'A' });
  const b = await createChild(api, p.token, { name: 'B' });
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode, a.id);

  const moved = await api('PATCH', `/api/devices/${d.id}`, { token: p.token, body: { child_id: b.id } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.device.child_id, b.id);

  const cleared = await api('PATCH', `/api/devices/${d.id}`, { token: p.token, body: { child_id: null } });
  assert.equal(cleared.body.device.child_id, null);

  const missing = await api('PATCH', `/api/devices/${d.id}`, { token: p.token, body: {} });
  assert.equal(missing.status, 400);

  const other = await registerParent(api);
  const foreign = await createChild(api, other.token);
  const bad = await api('PATCH', `/api/devices/${d.id}`, { token: p.token, body: { child_id: foreign.id } });
  assert.equal(bad.status, 404);
  assert.equal(bad.body.error.code, 'child_not_found');
});

test('parent disable and enable; admin disable is not parent-reversible', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);

  const off = await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: { reason: 'homework' } });
  assert.equal(off.status, 200);
  assert.equal(off.body.device.status, 'disabled');
  assert.equal(off.body.device.disabled_by, 'parent');
  assert.equal(off.body.device.status_reason, 'homework');

  const twice = await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: {} });
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error.code, 'device_not_active');

  const on = await api('POST', `/api/devices/${d.id}/enable`, { token: p.token });
  assert.equal(on.body.device.status, 'active');
  const onAgain = await api('POST', `/api/devices/${d.id}/enable`, { token: p.token });
  assert.equal(onAgain.body.error.code, 'device_not_disabled');

  const adminOff = await api('POST', `/admin/devices/${d.id}/disable`, { headers: adminHeaders, body: { reason: 'abuse report' } });
  assert.equal(adminOff.status, 200);
  const parentOn = await api('POST', `/api/devices/${d.id}/enable`, { token: p.token });
  assert.equal(parentOn.status, 403);
  assert.equal(parentOn.body.error.code, 'disabled_by_operator');
  const list = await api('GET', '/api/devices', { token: p.token });
  assert.equal(list.body.devices[0].disabled_by, 'admin');
});

test('unpair returns the toy to provisioned and the same printed code claims it again', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p1.token, d.claimCode);

  const del = await api('DELETE', `/api/devices/${d.id}`, { token: p1.token });
  assert.equal(del.status, 204);
  assert.deepEqual((await api('GET', '/api/devices', { token: p1.token })).body.devices, []);

  const adminList = await api('GET', `/admin/devices?status=provisioned`, { headers: adminHeaders });
  assert.deepEqual(adminList.body.devices.map((x) => x.id), [d.id]);

  const again = await claimDevice(api, p2.token, d.claimCode);
  assert.equal(again.status, 'active');
  assert.deepEqual((await api('GET', '/api/devices', { token: p2.token })).body.devices.map((x) => x.id), [d.id]);
});

test('claim attempts are rate limited per parent after 10', async () => {
  const p = await registerParent(api);
  for (let i = 0; i < 10; i += 1) {
    const res = await api('POST', '/api/devices/claim', { token: p.token, body: { claim_code: 'ABCD-EFGH' } });
    assert.equal(res.status, 404, `attempt ${i + 1}`);
  }
  const d = await provisionDevice();
  const blocked = await api('POST', '/api/devices/claim', { token: p.token, body: { claim_code: d.claimCode } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});
