import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb } from '../helpers/db.js';
import { pool } from '../../store/db.js';
import * as families from '../../store/family.js';
import * as registry from '../../devices/registry.js';
import { normalizeClaimCode } from '../../devices/claim_code.js';
import { claimCodeHash } from '../../devices/secret_box.js';
import { provisionDevice } from '../helpers/fixtures.js';

let family;

before(async () => {
  await setupDb();
});

beforeEach(async () => {
  await resetDb();
  family = await families.insert(pool, { name: 'F' });
});

after(async () => {
  await teardownDb();
});

const events = async (id) => (await registry.listEvents(id)).map((e) => e.event);

test('provisionBatch creates sealed rows, a provisioned event, and a manifest with raw secrets', async () => {
  const d = await provisionDevice({ count: 3 });
  assert.equal(d.all.length, 3);
  assert.deepEqual(d.all.map((x) => x.serial.slice(-5)), ['-0001', '-0002', '-0003']);
  assert.match(d.secretHex, /^[0-9a-f]{64}$/);
  assert.match(d.claimCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const row = await pool.query('SELECT secret_enc, claim_code_hash, status FROM devices WHERE id = $1', [d.id]);
  assert.match(row.rows[0].secret_enc, /^v1:/);
  assert.equal(row.rows[0].claim_code_hash, claimCodeHash(normalizeClaimCode(d.claimCode)));
  assert.equal(row.rows[0].status, 'provisioned');
  assert.deepEqual(await events(d.id), ['provisioned']);

  await assert.rejects(registry.provisionBatch({ label: d.batch.label, hardwareRev: 'r1', count: 1 }), (e) => e.code === 'batch_exists');
  await assert.rejects(registry.provisionBatch({ label: 'bad label', hardwareRev: 'r1', count: 1 }), (e) => e.code === 'invalid_batch_label');
  await assert.rejects(registry.provisionBatch({ label: 'OK1', hardwareRev: 'r1', count: 0 }), (e) => e.code === 'invalid_count');
});

test('getForAuth decrypts the secret that the manifest carried', async () => {
  const d = await provisionDevice();
  const auth = await registry.getForAuth(d.id);
  assert.ok(auth.secret.equals(d.secret));
  assert.equal(auth.prevSecret, null);
  assert.equal(auth.device.status, 'provisioned');
  assert.equal(auth.device.secret, undefined);
  assert.equal(await registry.getForAuth('00000000-0000-4000-8000-000000000000'), null);
});

test('the full happy path: claim, disable, enable, unpair, claim again', async () => {
  const d = await provisionDevice();
  const claimed = await registry.claimByCode({ familyId: family.id, claimCode: d.claimCode.toLowerCase() });
  assert.equal(claimed.status, 'active');
  assert.equal(claimed.family_id, family.id);
  assert.ok(claimed.claimed_at);

  const disabled = await registry.disable({ deviceId: d.id, familyId: family.id, by: 'parent', reason: 'bedtime' });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.disabled_by, 'parent');
  assert.equal(disabled.status_reason, 'bedtime');

  const enabled = await registry.enable({ deviceId: d.id, familyId: family.id, by: 'parent' });
  assert.equal(enabled.status, 'active');
  assert.equal(enabled.disabled_by, null);

  const unpaired = await registry.unpair({ deviceId: d.id, familyId: family.id });
  assert.equal(unpaired.status, 'provisioned');
  assert.equal(unpaired.family_id, null);
  assert.equal(unpaired.claimed_at, null);

  const other = await families.insert(pool, { name: 'G' });
  const again = await registry.claimByCode({ familyId: other.id, claimCode: d.claimCode });
  assert.equal(again.family_id, other.id);

  assert.deepEqual(await events(d.id), ['provisioned', 'claimed', 'disabled', 'enabled', 'unpaired', 'claimed']);
});

test('claim rejects wrong, consumed and malformed codes identically or as 400', async () => {
  const d = await provisionDevice();
  await assert.rejects(registry.claimByCode({ familyId: family.id, claimCode: 'ABCD-EFGH' }), (e) => e.status === 404 && e.code === 'claim_code_invalid');
  await registry.claimByCode({ familyId: family.id, claimCode: d.claimCode });
  await assert.rejects(registry.claimByCode({ familyId: family.id, claimCode: d.claimCode }), (e) => e.code === 'claim_code_invalid');
  await assert.rejects(registry.claimByCode({ familyId: family.id, claimCode: 'ABC' }), (e) => e.status === 400);
});

test('forbidden transitions are rejected with the right codes', async () => {
  const d = await provisionDevice();
  await assert.rejects(registry.disable({ deviceId: d.id, by: 'admin', reason: 'x' }), (e) => e.code === 'device_not_active');
  await assert.rejects(registry.enable({ deviceId: d.id, by: 'admin' }), (e) => e.code === 'device_not_disabled');
  await assert.rejects(registry.unpair({ deviceId: d.id, familyId: family.id }), (e) => e.code === 'device_not_found');

  await registry.claimByCode({ familyId: family.id, claimCode: d.claimCode });
  await assert.rejects(registry.enable({ deviceId: d.id, familyId: family.id, by: 'parent' }), (e) => e.code === 'device_not_disabled');
  await assert.rejects(registry.reissueClaimCode({ deviceId: d.id }), (e) => e.code === 'device_already_claimed');

  const otherFamily = await families.insert(pool, { name: 'G' });
  await assert.rejects(registry.disable({ deviceId: d.id, familyId: otherFamily.id, by: 'parent' }), (e) => e.code === 'device_not_found');
});

test('an admin disable cannot be undone by a parent', async () => {
  const d = await provisionDevice();
  await registry.claimByCode({ familyId: family.id, claimCode: d.claimCode });
  await registry.disable({ deviceId: d.id, by: 'admin', reason: 'abuse report' });
  await assert.rejects(registry.enable({ deviceId: d.id, familyId: family.id, by: 'parent' }), (e) => e.status === 403 && e.code === 'disabled_by_operator');
  const back = await registry.enable({ deviceId: d.id, by: 'admin' });
  assert.equal(back.status, 'active');
});

test('revoked is terminal and needs a known reason', async () => {
  const d = await provisionDevice();
  await assert.rejects(registry.revoke({ deviceId: d.id, reason: 'because' }), (e) => e.status === 400);
  const revoked = await registry.revoke({ deviceId: d.id, reason: 'lost' });
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.status_reason, 'lost');

  await assert.rejects(registry.claimByCode({ familyId: family.id, claimCode: d.claimCode }), (e) => e.code === 'claim_code_invalid');
  await assert.rejects(registry.revoke({ deviceId: d.id, reason: 'stolen' }), (e) => e.code === 'device_revoked');
  await assert.rejects(registry.disable({ deviceId: d.id, by: 'admin', reason: 'x' }), (e) => e.code === 'device_revoked');
  await assert.rejects(registry.enable({ deviceId: d.id, by: 'admin' }), (e) => e.code === 'device_revoked');
  await assert.rejects(registry.rotateSecret({ deviceId: d.id }), (e) => e.code === 'device_revoked');
  assert.deepEqual(await events(d.id), ['provisioned', 'revoked']);
});

test('reissued claim code replaces the printed one', async () => {
  const d = await provisionDevice();
  const fresh = await registry.reissueClaimCode({ deviceId: d.id });
  assert.match(fresh, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.notEqual(fresh, d.claimCode);
  await assert.rejects(registry.claimByCode({ familyId: family.id, claimCode: d.claimCode }), (e) => e.code === 'claim_code_invalid');
  const claimed = await registry.claimByCode({ familyId: family.id, claimCode: fresh });
  assert.equal(claimed.status, 'active');
});

test('rotateSecret keeps the old secret valid until the grace period ends', async () => {
  const d = await provisionDevice();
  const rotated = await registry.rotateSecret({ deviceId: d.id });
  assert.match(rotated.secret_hex, /^[0-9a-f]{64}$/);
  assert.notEqual(rotated.secret_hex, d.secretHex);

  let auth = await registry.getForAuth(d.id);
  assert.equal(auth.secret.toString('hex'), rotated.secret_hex);
  assert.ok(auth.prevSecret.equals(d.secret));

  await pool.query(`UPDATE devices SET secret_prev_expires_at = now() - interval '1 second' WHERE id = $1`, [d.id]);
  auth = await registry.getForAuth(d.id);
  assert.equal(auth.prevSecret, null);
});

test('deleting a family unlinks a toy that was assigned to one of its children', async () => {
  const d = await provisionDevice();
  const child = await pool.query('INSERT INTO children (family_id, name, birth_year) VALUES ($1, $2, $3) RETURNING id', [family.id, 'Bông', 2020]);
  await registry.claimByCode({ familyId: family.id, claimCode: d.claimCode, childId: child.rows[0].id });
  await pool.query('DELETE FROM families WHERE id = $1', [family.id]);
  const row = await pool.query('SELECT status, family_id, child_id FROM devices WHERE id = $1', [d.id]);
  assert.deepEqual(row.rows[0], { status: 'active', family_id: null, child_id: null });
});

test('the blocked hook fires on disable, revoke and unpair', async () => {
  const calls = [];
  registry.setDeviceBlockedHook((id, status) => calls.push([id, status]));
  try {
    const d = await provisionDevice();
    await registry.claimByCode({ familyId: family.id, claimCode: d.claimCode });
    await registry.disable({ deviceId: d.id, by: 'admin', reason: 'x' });
    await registry.enable({ deviceId: d.id, by: 'admin' });
    await registry.unpair({ deviceId: d.id, familyId: family.id });
    await registry.revoke({ deviceId: d.id, reason: 'retired' });
    assert.deepEqual(calls.map((c) => c[1]), ['disabled', 'provisioned', 'revoked']);
    assert.ok(calls.every((c) => c[0] === d.id));
  } finally {
    registry.setDeviceBlockedHook(() => {});
  }
});
