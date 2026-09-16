import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { log, logOptions, redact } from '../../lib/log.js';

let lines;
const original = { ...logOptions };

beforeEach(() => {
  lines = [];
  logOptions.level = 'info';
  logOptions.write = (line) => lines.push(JSON.parse(line));
});

afterEach(() => {
  Object.assign(logOptions, original);
});

test('emits one JSON line with timestamp, level and event', () => {
  log.info('server_listening', { port: 3000 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, 'info');
  assert.equal(lines[0].event, 'server_listening');
  assert.equal(lines[0].port, 3000);
  assert.ok(Date.parse(lines[0].t) > 0);
});

test('redacts credential and content fields, including nested ones', () => {
  log.warn('auth_failed', {
    device_id: 'abc',
    sig: 'deadbeef',
    nonce: 'cafe',
    nested: { email: 'a@b.c', claim_code: 'ABCD', ok: 1 },
    list: [{ token: 't' }],
  });
  const line = lines[0];
  assert.equal(line.device_id, 'abc');
  assert.equal(line.sig, '[redacted]');
  assert.equal(line.nonce, '[redacted]');
  assert.equal(line.nested.email, '[redacted]');
  assert.equal(line.nested.claim_code, '[redacted]');
  assert.equal(line.nested.ok, 1);
  assert.equal(line.list[0].token, '[redacted]');
});

test('level threshold drops lower levels; silent drops everything', () => {
  logOptions.level = 'warn';
  log.info('dropped');
  log.warn('kept');
  assert.deepEqual(lines.map((l) => l.event), ['kept']);

  logOptions.level = 'silent';
  log.error('also_dropped');
  assert.equal(lines.length, 1);
});

test('redact leaves primitives and dates usable', () => {
  const d = new Date('2026-01-01T00:00:00Z');
  assert.equal(redact('x'), 'x');
  assert.equal(redact(5), 5);
  assert.equal(redact(null), null);
  assert.equal(redact({ at: d }).at, d.toISOString());
});
