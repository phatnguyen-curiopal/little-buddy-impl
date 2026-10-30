import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { vnd, relativeTime, age, isoDay, localTimeZone, pricePerAnswer, waitWords } from '../src/lib/format.js';
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

test('age counts whole years from a birth date, and knows when it cannot', () => {
  const now = new Date(2026, 8, 24);
  assert.equal(age('2020-09-24', now), 6, 'the birthday itself');
  assert.equal(age('2020-09-25', now), 5, 'the day before the birthday');
  assert.equal(age('2020-03-01', now), 6);
  assert.equal(age('2026-09-24', now), 0);
  assert.equal(age('2027-01-01', now), null, 'not born yet');
  assert.equal(age('2020-02-30', now), null, 'not a real day');
  assert.equal(age(null, now), null);
  assert.equal(age(2020, now), null, 'a bare year is not a birth date');
});

test('a calendar day is the local one, as a date input wants it', () => {
  assert.equal(isoDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(isoDay(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
  const zone = localTimeZone();
  assert.ok(zone === undefined || typeof zone === 'string');
});

test("a 429's wait is worded by its size, rounded up", () => {
  assert.deepEqual(waitWords(30), { key: 'err_rate_limited_s', vars: { s: 30 } });
  assert.deepEqual(waitWords(89), { key: 'err_rate_limited_s', vars: { s: 89 } });
  assert.deepEqual(waitWords(90), { key: 'err_rate_limited_m', vars: { m: 2 } }, 'a minute and a half reads as 2 minutes');
  assert.deepEqual(waitWords(720), { key: 'err_rate_limited_m', vars: { m: 12 } }, 'a refused sign-up');
  assert.deepEqual(waitWords(361), { key: 'err_rate_limited_m', vars: { m: 7 } });
  assert.deepEqual(waitWords(5399), { key: 'err_rate_limited_m', vars: { m: 90 } });
  assert.deepEqual(waitWords(5400), { key: 'err_rate_limited_h', vars: { h: 2 } });
  assert.deepEqual(waitWords(86400), { key: 'err_rate_limited_h', vars: { h: 24 } }, "the day's browser Buddies");
  assert.deepEqual(waitWords(2.2), { key: 'err_rate_limited_s', vars: { s: 3 } });
});

test('with no usable Retry-After, or a single second, the wait has no number', () => {
  for (const value of [null, undefined, '', 0, -5, 1, 0.4, 'soon', Infinity, Number.NaN]) {
    assert.deepEqual(waitWords(value), { key: 'err_rate_limited', vars: {} }, `Retry-After ${String(value)}`);
  }
});

test('the wait reads naturally in both languages', () => {
  const say = (lang, seconds) => {
    const { key, vars } = waitWords(seconds);
    return translate(lang, key, vars);
  };
  assert.equal(say('vi', 720), 'Bạn thử hơi nhiều lần. Chờ khoảng 12 phút rồi thử lại nhé.');
  assert.equal(say('en', 720), 'Too many tries. Please wait about 12 minutes and try again.');
  assert.equal(say('vi', 45), 'Bạn thử hơi nhiều lần. Chờ khoảng 45 giây rồi thử lại nhé.');
  assert.equal(say('en', 86400), 'Too many tries. Please wait about 24 hours and try again.');
  assert.equal(say('vi', null), 'Bạn thử hơi nhiều lần. Chờ một chút rồi thử lại nhé.');
  assert.equal(say('en', 1), 'Too many tries. Please wait a little and try again.');
});

test('price per answer', () => {
  assert.equal(pricePerAnswer({ price_amount: 129000, credits: 60 }), 2150);
});

test('emotions: fourteen drawn faces, unknown falls back to neutral', () => {
  assert.equal(EMOTIONS.length, 14);
  assert.equal(new Set(EMOTIONS).size, 14);
  for (const e of ['listening', 'happy', 'sleepy', 'confused']) assert.equal(normalizeEmotion(e), e);
  assert.equal(normalizeEmotion(' HAPPY '), 'happy');
  assert.equal(normalizeEmotion('furious'), 'neutral');
  assert.equal(normalizeEmotion(null), 'neutral');
  assert.equal(normalizeEmotion('constructor'), 'neutral', 'no inherited property passes for a face');
});

test("backend-v2's faces the drawings lack show as the nearest one", async () => {
  assert.equal(normalizeEmotion('proud'), 'happy');
  assert.equal(normalizeEmotion('worried'), 'sad');
  assert.equal(normalizeEmotion('Calm'), 'neutral');
  // Every face backend-v2 can send keeps a face of its own: only these three
  // fall back, so a face added there shows up here instead of as neutral.
  const types = await readFile(new URL('../../backend-v2/src/domain/types.ts', import.meta.url), 'utf8');
  const list = /export const EMOTIONS = \[([^\]]*)\]/.exec(types)?.[1] ?? '';
  const faces = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(faces.length >= 10, `found ${faces.length} faces, the scan is probably broken`);
  for (const face of faces) {
    const shown = normalizeEmotion(face);
    assert.ok(shown === face || ['proud', 'worried', 'calm'].includes(face), `${face} is drawn as ${shown}`);
  }
});
