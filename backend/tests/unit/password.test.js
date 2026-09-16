import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../../auth/password.js';

test('hash verifies the same password and rejects another', async () => {
  const stored = await hashPassword('hunter2hunter2');
  assert.equal(await verifyPassword('hunter2hunter2', stored), true);
  assert.equal(await verifyPassword('hunter2hunter3', stored), false);
});

test('stored string carries algorithm and parameters', async () => {
  const stored = await hashPassword('hunter2hunter2');
  const parts = stored.split('$');
  assert.equal(parts.length, 6);
  assert.equal(parts[0], 'scrypt');
  assert.equal(parts[1], '4096');
  assert.equal(parts[2], '8');
  assert.equal(parts[3], '1');
});

test('two hashes of the same password differ (random salt)', async () => {
  const a = await hashPassword('same password');
  const b = await hashPassword('same password');
  assert.notEqual(a, b);
});

test('a hash made at another cost still verifies', async () => {
  const stored = await hashPassword('hunter2hunter2', 1024);
  assert.match(stored, /^scrypt\$1024\$/);
  assert.equal(await verifyPassword('hunter2hunter2', stored), true);
});

test('malformed stored values never throw, only return false', async () => {
  for (const bad of ['', 'nonsense', 'bcrypt$1$2$3$4$5', 'scrypt$4096$8$1$$', null, undefined, 42]) {
    assert.equal(await verifyPassword('anything', bad), false);
  }
});

test('the timing dummy hash is a valid hash that matches nothing useful', async () => {
  assert.match(DUMMY_HASH, /^scrypt\$/);
  assert.equal(await verifyPassword('', DUMMY_HASH), false);
});
