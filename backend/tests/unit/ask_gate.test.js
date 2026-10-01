import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTurn, denialFor, failedAnswer, languageOf, DENIALS, FAILED_ANSWERS, LANGUAGES, REASONS } from '../../gate/ask_gate.js';

const active = { status: 'active', family_id: 'fam' };

test('a child cannot tell out of credits from a break: identical payloads, in every language', () => {
  for (const lang of LANGUAGES) {
    const d = DENIALS[lang];
    assert.deepEqual(d.no_credits, d.disabled);
    assert.deepEqual(JSON.stringify(denialFor('no_credits', lang)), JSON.stringify(denialFor('disabled', lang)));
    assert.deepEqual(d.daily_limit, d.disabled);
    assert.deepEqual(d.quiet_hours, d.disabled);
  }
});

test('denials carry only an emotion and a sentence, never a reason or a money word', () => {
  for (const lang of LANGUAGES) {
    for (const reason of REASONS) {
      const d = denialFor(reason, lang);
      assert.deepEqual(Object.keys(d).sort(), ['emotion', 'say']);
    }
  }
  assert.doesNotMatch(JSON.stringify(DENIALS.en), /(credits?|money|pay|paid|buy|balance|wallet|purchase|coins?|price)/i);
  // Keys like no_credits are codes the toy never sees; only the spoken lines matter.
  const viLines = Object.values(DENIALS.vi).map((d) => d.say).join(' ');
  assert.doesNotMatch(viLines, /(tiền|xu|mua|trả|thanh toán|số dư|ví|giá|credit)/i);
});

test('lines follow the conversation language; unknown falls back to Vietnamese', () => {
  assert.notEqual(denialFor('disabled', 'en').say, denialFor('disabled', 'vi').say);
  assert.deepEqual(denialFor('disabled'), DENIALS.vi.disabled);
  assert.deepEqual(denialFor('disabled', 'fr'), DENIALS.vi.disabled);
  assert.deepEqual(failedAnswer('en'), FAILED_ANSWERS.en);
  assert.deepEqual(failedAnswer(undefined), FAILED_ANSWERS.vi);
  assert.equal(languageOf('en'), 'en');
  assert.equal(languageOf(null), 'vi');
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
