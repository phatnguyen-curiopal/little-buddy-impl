// DEVICE_AUTH=off must be set before config.js is first imported, which is
// why everything below is a dynamic import.
process.env.DEVICE_AUTH = 'off';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { setupDb, teardownDb, resetDb, resetRedis } = await import('../helpers/db.js');
const { startTestServer } = await import('../helpers/app.js');
const { registerParent, provisionDevice, claimDevice } = await import('../helpers/fixtures.js');
const registry = await import('../../devices/registry.js');

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

test('with auth off, only a real device id is needed and status rules still apply', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();

  const unclaimed = await api('POST', '/v1/heartbeat', { headers: { 'x-lb-device': d.id }, body: {} });
  assert.equal(unclaimed.status, 200);
  assert.equal(unclaimed.body.status, 'provisioned');

  const unknown = await api('POST', '/v1/heartbeat', { headers: { 'x-lb-device': '00000000-0000-4000-8000-000000000000' }, body: {} });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.code, 'auth_unknown_device');

  const missing = await api('POST', '/v1/heartbeat', { body: {} });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.error.code, 'auth_missing');

  await claimDevice(api, p.token, d.claimCode);
  await registry.revoke({ deviceId: d.id, reason: 'lost' });
  const revoked = await api('POST', '/v1/heartbeat', { headers: { 'x-lb-device': d.id }, body: {} });
  assert.equal(revoked.status, 403);
  assert.equal(revoked.body.error.code, 'device_revoked');
});
