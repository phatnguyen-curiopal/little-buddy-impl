import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brainDeadlineMs, STALE_SAFETY_MS } from '../../turns/deadline.js';

const base = { startedAt: 1_000_000, staleAfterSec: 180, brainTimeoutMs: 45_000 };

test('a fresh turn gets the whole brain timeout', () => {
  assert.equal(brainDeadlineMs({ ...base, now: base.startedAt + 3_000 }), 45_000);
});

test('a turn close to going stale gets only what is left before the safety margin', () => {
  const now = base.startedAt + 150_000;
  assert.equal(brainDeadlineMs({ ...base, now }), 180_000 - STALE_SAFETY_MS - 150_000);
});

test('a turn already past the margin gets zero, never a negative timeout', () => {
  assert.equal(brainDeadlineMs({ ...base, now: base.startedAt + 179_000 }), 0);
});
