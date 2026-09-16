import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSecretBox, newDeviceSecret, wrapSecret, unwrapSecret, claimCodeHash } from '../../devices/secret_box.js';

const deviceId = '11111111-1111-4111-8111-111111111111';

test('wrap and unwrap round-trip a 32-byte secret', () => {
  const secret = newDeviceSecret();
  assert.equal(secret.length, 32);
  const wrapped = wrapSecret(deviceId, secret);
  assert.match(wrapped, /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]{64}$/);
  assert.ok(unwrapSecret(deviceId, wrapped).equals(secret));
  assert.notEqual(wrapSecret(deviceId, secret), wrapped, 'fresh iv each time');
});

test('a ciphertext cannot be moved to another device id', () => {
  const wrapped = wrapSecret(deviceId, newDeviceSecret());
  assert.throws(() => unwrapSecret('22222222-2222-4222-8222-222222222222', wrapped));
});

test('a tampered tag or ciphertext fails to unwrap', () => {
  const wrapped = wrapSecret(deviceId, newDeviceSecret());
  const parts = wrapped.split(':');
  const flip = (hex) => (hex[0] === '0' ? '1' : '0') + hex.slice(1);
  assert.throws(() => unwrapSecret(deviceId, [parts[0], parts[1], flip(parts[2]), parts[3]].join(':')));
  assert.throws(() => unwrapSecret(deviceId, [parts[0], parts[1], parts[2], flip(parts[3])].join(':')));
  assert.throws(() => unwrapSecret(deviceId, 'v9:aa:bb:cc'), /unsupported version/);
});

test('a different KEK cannot unwrap, and yields different claim hashes', () => {
  const other = makeSecretBox('another-kek-entirely-0123456789ab');
  const secret = newDeviceSecret();
  assert.throws(() => other.unwrapSecret(deviceId, wrapSecret(deviceId, secret)));
  assert.equal(claimCodeHash('ABCDEFGH'), claimCodeHash('ABCDEFGH'));
  assert.notEqual(claimCodeHash('ABCDEFGH'), other.claimCodeHash('ABCDEFGH'));
  assert.match(claimCodeHash('ABCDEFGH'), /^[0-9a-f]{64}$/);
});
