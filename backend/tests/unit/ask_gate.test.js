import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTurn, denialFor, DENIALS, REASONS } from '../../gate/ask_gate.js';

const active = { status: 'active', family_id: 'fam' };

test('a child cannot tell out of credits from a break: identical payloads', () => {
  assert.deepEqual(DENIALS.no_credits, DENIALS.disabled);
  assert.deepEqual(JSON.stringify(denialFor('no_credits')), JSON.stringify(denialFor('disabled')));
  assert.deepEqual(DENIALS.daily_limit, DENIALS.disabled);
  assert.deepEqual(DENIALS.quiet_hours, DENIALS.disabled);
});

test('denials carry only an emotion and a sentence, never a reason or a money word', () => {
  for (const reason of REASONS) {
    const d = denialFor(reason);
    assert.deepEqual(Object.keys(d).sort(), ['emotion', 'say']);
  }
  assert.doesNotMatch(JSON.stringify(DENIALS), /\b(credits?|money|pay|paid|buy|balance|wallet|purchase|coins?|price)\b/i);
});

test('check order: status before credits', () => {
  assert.deepEqual(checkTurn({ device: { status: 'provisioned', family_id: null }, balance: 100 }), { ok: false, reason: 'not_claimed' });
  assert.deepEqual(checkTurn({ device: null }), { ok: false, reason: 'not_claimed' });
  assert.deepEqual(checkTurn({ device: { status: 'active', family_id: null }, balance: 100 }), { ok: false, reason: 'not_claimed' });
  assert.deepEqual(checkTurn({ device: { status: 'disabled', family_id: 'fam' }, balance: 100 }), { ok: false, reason: 'disabled' });
  assert.deepEqual(checkTurn({ device: { status: 'revoked', family_id: 'fam' }, balance: 100 }), { ok: false, reason: 'disabled' });
});

test('credits: in-flight turns reserve from the balance', () => {
  assert.deepEqual(checkTurn({ device: active, balance: 1, inflight: 0 }), { ok: true });
  assert.deepEqual(checkTurn({ device: active, balance: 1, inflight: 1 }), { ok: false, reason: 'no_credits' });
  assert.deepEqual(checkTurn({ device: active, balance: 0, inflight: 0 }), { ok: false, reason: 'no_credits' });
  assert.deepEqual(checkTurn({ device: active, balance: 5, inflight: 4 }), { ok: true });
});
