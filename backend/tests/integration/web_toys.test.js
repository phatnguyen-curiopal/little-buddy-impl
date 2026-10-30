import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, createChild } from '../helpers/fixtures.js';
import { pool } from '../../store/db.js';
import { MAX_WEB_TOYS_PER_FAMILY } from '../../devices/registry.js';

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

test('a web Buddy is created and claimed in one call, with the default profile', async () => {
  const p = await registerParent(api);
  const child = await createChild(api, p.token);

  const res = await api('POST', '/api/devices/web', { token: p.token, body: { child_id: child.id } });
  assert.equal(res.status, 201);
  const device = res.body.device;
  assert.equal(device.status, 'active');
  assert.equal(device.child_id, child.id);
  assert.equal(device.hardware_rev, 'web');
  assert.match(device.serial, /^WEB\d{4}-0001$/);
  assert.ok(device.claimed_at);
  assert.equal(device.profile.name, 'Buddy');
  assert.equal(device.profile.role, 'friend');
  for (const key of ['secret', 'secret_enc', 'secret_hex', 'claim_code', 'claim_code_hash', 'family_id']) {
    assert.equal(device[key], undefined, key);
  }

  const list = await api('GET', '/api/devices', { token: p.token });
  assert.deepEqual(list.body.devices.map((x) => x.id), [device.id]);

  // The browser plays it like any claimed toy.
  const reveal = await api('POST', `/api/devices/${device.id}/secret`, { token: p.token });
  assert.equal(reveal.status, 200);
  assert.equal(reveal.body.device_id, device.id);

  const events = await pool.query('SELECT event FROM device_events WHERE device_id = $1 ORDER BY id', [device.id]);
  assert.deepEqual(events.rows.map((r) => r.event), ['provisioned', 'claimed', 'secret_revealed']);
});

test('web Buddies share one batch and count up; the family cap is enforced', async () => {
  const p = await registerParent(api);
  const serials = [];
  for (let i = 0; i < MAX_WEB_TOYS_PER_FAMILY; i += 1) {
    const res = await api('POST', '/api/devices/web', { token: p.token, body: {} });
    assert.equal(res.status, 201);
    assert.equal(res.body.device.child_id, null);
    serials.push(res.body.device.serial);
  }
  const expected = Array.from({ length: MAX_WEB_TOYS_PER_FAMILY }, (_, i) => String(i + 1).padStart(4, '0'));
  assert.deepEqual(serials.map((s) => s.slice(-4)), expected);
  const batches = await pool.query("SELECT size FROM device_batches WHERE label LIKE 'WEB%'");
  assert.equal(batches.rows.length, 1);
  assert.equal(batches.rows[0].size, MAX_WEB_TOYS_PER_FAMILY);

  const over = await api('POST', '/api/devices/web', { token: p.token, body: {} });
  assert.equal(over.status, 409);
  assert.equal(over.body.error.code, 'web_toy_limit');

  // The cap is per family: another family keeps counting up in the same batch.
  const p2 = await registerParent(api);
  const other = await api('POST', '/api/devices/web', { token: p2.token, body: {} });
  assert.equal(other.status, 201);
  assert.equal(other.body.device.serial.slice(-4), String(MAX_WEB_TOYS_PER_FAMILY + 1).padStart(4, '0'));
});

test("another family's child is not found, and nothing is created", async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const child = await createChild(api, p1.token);

  const res = await api('POST', '/api/devices/web', { token: p2.token, body: { child_id: child.id } });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'child_not_found');

  const rows = await pool.query('SELECT count(*)::int AS n FROM devices');
  assert.equal(rows.rows[0].n, 0);
});
