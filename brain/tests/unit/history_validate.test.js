import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { decodeMetaHeader, validateMeta } from '../../http/validate.js';
import { createHistory } from '../../memory/history.js';

test('history keeps the last N turns, starts on a user turn and expires', () => {
  let now = 0;
  const history = createHistory({ maxTurns: 2, ttlMs: 1000, now: () => now });
  for (const i of [1, 2, 3]) history.append('s', 'c', `u${i}`, `a${i}`);
  assert.deepEqual(history.get('s', 'c').map((m) => m.content), ['u2', 'a2', 'u3', 'a3']);
  assert.deepEqual(history.get('other', 'c'), []);
  now = 2000;
  assert.deepEqual(history.get('s', 'c'), []);
  history.close();
});

test('wiping a subject forgets every conversation of it only', () => {
  const history = createHistory();
  history.append('a', 'c1', 'u', 'x');
  history.append('a', 'c2', 'u', 'x');
  history.append('b', 'c1', 'u', 'x');
  history.wipeSubject('a');
  assert.equal(history.size(), 1);
  assert.equal(history.get('b', 'c1').length, 2);
  history.close();
});

test('HISTORY_MAX_TURNS=0 keeps nothing', () => {
  const history = createHistory({ maxTurns: 0 });
  history.append('s', 'c', 'u', 'a');
  assert.deepEqual(history.get('s', 'c'), []);
  history.close();
});

const good = () => ({
  turn_id: randomUUID(),
  conversation_id: randomUUID(),
  device_id: randomUUID(),
  subject: `device:${randomUUID()}:${randomUUID()}`,
  child: null,
  buddy: { name: 'Buddy', role: 'mommy', personality: 'esfj'.toUpperCase() },
  settings: { language: 'en', voice_id: 'abc_DEF-1', learn: true, mood_pin: 0 },
});

test('a valid meta passes, mood_pin 0 kept as a real value', () => {
  const { meta, errors } = validateMeta(good());
  assert.equal(errors, undefined);
  assert.equal(meta.settings.mood_pin, 0);
  assert.equal(meta.child, null);
});

test('every bad field is reported at once', () => {
  const bad = {
    ...good(),
    turn_id: 'x',
    subject: 'family:1',
    buddy: { name: '', role: 'robot', personality: 'ABCD' },
    settings: { language: 'fr', voice_id: '../x', learn: 'yes', mood_pin: 101 },
    child: { name: 'Bông', birth_year: '2020' },
  };
  const { errors } = validateMeta(bad, { requireText: true });
  const fields = errors.map((e) => e.field).sort();
  assert.deepEqual(fields, [
    'buddy.name', 'buddy.personality', 'buddy.role', 'child.birth_year', 'settings.language',
    'settings.learn', 'settings.mood_pin', 'settings.voice_id', 'subject', 'text', 'turn_id',
  ]);
});

test('an implausible birth year is dropped, not refused', () => {
  const future = new Date().getUTCFullYear() + 1;
  for (const year of [1800, future, 2100]) {
    const { meta, errors } = validateMeta({ ...good(), child: { name: 'Bông', birth_year: year } });
    assert.equal(errors, undefined);
    assert.deepEqual(meta.child, { name: 'Bông', birth_year: null });
  }
  assert.equal(validateMeta({ ...good(), child: { name: 'Bông', birth_year: 2020 } }).meta.child.birth_year, 2020);
});

test('text turns need 1 to 2000 characters', () => {
  assert.ok(validateMeta({ ...good(), text: ' hi ' }, { requireText: true }).meta.text === 'hi');
  assert.ok(validateMeta({ ...good(), text: 'x'.repeat(2001) }, { requireText: true }).errors);
  assert.ok(validateMeta({ ...good(), text: '   ' }, { requireText: true }).errors);
});

test('the meta header is base64url of UTF-8 JSON', () => {
  const meta = { buddy: { name: 'Mây' } };
  assert.deepEqual(decodeMetaHeader(Buffer.from(JSON.stringify(meta)).toString('base64url')), meta);
  assert.equal(decodeMetaHeader('%%%'), null);
  assert.equal(decodeMetaHeader(undefined), null);
});
