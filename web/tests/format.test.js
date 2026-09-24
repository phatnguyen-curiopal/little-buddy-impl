import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vnd, relativeTime, age, pricePerAnswer } from '../src/lib/format.js';
import { EMOTIONS, normalizeEmotion } from '../src/lib/emotions.js';
import { translate } from '../src/lib/translate.js';

test('VND has no decimals and uses the locale grouping', () => {
  assert.match(vnd(49000, 'vi'), /^49\.000\s?₫$/);
  assert.match(vnd(49000, 'en'), /49,000/);
});

test('relative time reads naturally in both languages', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const tvi = (k, v) => translate('vi', k, v);
  const ten = (k, v) => translate('en', k, v);
  assert.equal(relativeTime('2026-09-24T11:59:40Z', tvi, now), 'vừa xong');
  assert.equal(relativeTime('2026-09-24T11:55:00Z', ten, now), '5 min ago');
  assert.equal(relativeTime('2026-09-24T09:00:00Z', tvi, now), '3 giờ trước');
  assert.equal(relativeTime('2026-09-23T09:00:00Z', ten, now), 'yesterday');
  assert.equal(relativeTime('2026-09-20T09:00:00Z', ten, now), '4 days ago');
  assert.equal(relativeTime(null, ten, now), 'never connected');
});

test('age and price per answer', () => {
  assert.equal(age(2020, new Date(2026, 8, 24)), 6);
  assert.equal(pricePerAnswer({ price_amount: 129000, credits: 60 }), 2150);
});

test('emotions: fourteen known values, unknown falls back to neutral', () => {
  assert.equal(EMOTIONS.length, 14);
  assert.equal(new Set(EMOTIONS).size, 14);
  for (const e of ['listening', 'happy', 'sleepy', 'confused']) assert.equal(normalizeEmotion(e), e, 'backend values are all known');
  assert.equal(normalizeEmotion(' HAPPY '), 'happy');
  assert.equal(normalizeEmotion('furious'), 'neutral');
  assert.equal(normalizeEmotion(null), 'neutral');
});
