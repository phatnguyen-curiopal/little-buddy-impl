import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOOD_START, SETTINGS_DEFAULTS, chosenVoice, clampMood, defaultVoice, sampleUrl, settingsOf, voicesFor } from '../src/lib/toySettings.js';

test('a profile without settings reads as the defaults', () => {
  assert.deepEqual(settingsOf(undefined), SETTINGS_DEFAULTS);
  assert.deepEqual(settingsOf({ name: 'Buddy' }), { language: 'vi', voice_id: null, learn: false, mood_pin: null });
});

test('valid settings are kept, odd values fall back', () => {
  assert.deepEqual(settingsOf({ language: 'en', voice_id: 'v1', learn: true, mood_pin: 0 }), { language: 'en', voice_id: 'v1', learn: true, mood_pin: 0 });
  assert.deepEqual(settingsOf({ language: 'fr', voice_id: '', learn: 'yes', mood_pin: 101 }), SETTINGS_DEFAULTS);
  assert.equal(settingsOf({ mood_pin: 12.5 }).mood_pin, null);
});

test('the mood slider value is clamped to 0..100', () => {
  assert.equal(clampMood('42'), 42);
  assert.equal(clampMood(-5), 0);
  assert.equal(clampMood(250), 100);
  assert.equal(clampMood('x'), MOOD_START);
});

// As GET /api/voices sends them: grouped by language, in display order.
const VOICES = [
  { id: 'dude', label: 'Little Dude II', language: 'en', is_default: true },
  { id: 'ziggy', label: 'Ziggy', language: 'en', is_default: false },
  { id: 'anh', label: 'Phan Anh', language: 'vi', is_default: true },
  { id: 'hong', label: 'Cam Hong', language: 'vi', is_default: false },
];

test('a toy is offered only the voices of its language, in order', () => {
  assert.deepEqual(voicesFor(VOICES, 'vi').map((v) => v.id), ['anh', 'hong']);
  assert.deepEqual(voicesFor(VOICES, 'en').map((v) => v.id), ['dude', 'ziggy']);
  assert.deepEqual(voicesFor(undefined, 'vi'), []);
});

test('each language has its own default; without a marked one its first voice', () => {
  assert.equal(defaultVoice(VOICES, 'vi').id, 'anh');
  assert.equal(defaultVoice(VOICES, 'en').id, 'dude');
  assert.equal(defaultVoice(VOICES.map((v) => ({ ...v, is_default: false })), 'en').id, 'dude');
  assert.equal(defaultVoice([], 'vi'), null);
  assert.equal(defaultVoice(undefined, 'en'), null);
});

test('the picker shows the toy\'s choice, or the default it really speaks with', () => {
  assert.equal(chosenVoice(VOICES, 'vi', 'hong').id, 'hong');
  assert.equal(chosenVoice(VOICES, 'vi', null).id, 'anh', 'no choice is the default');
  assert.equal(chosenVoice(VOICES, 'vi', 'ziggy').id, 'anh', 'a voice of the other language is not shown as chosen');
  assert.equal(chosenVoice(VOICES, 'en', 'gone').id, 'dude', 'a removed voice falls back like the backend does');
  assert.equal(chosenVoice([], 'en', 'ziggy'), null);
});

test('a voice sample lives at a fixed path named by its id', () => {
  assert.equal(sampleUrl('fBD19tfE58bkETeiwUoC'), '/voice-samples/fBD19tfE58bkETeiwUoC.wav');
  assert.equal(sampleUrl('a b/c'), '/voice-samples/a%20b%2Fc.wav');
});

test('every voice migration 008 seeds has its sample checked in', async () => {
  const { readFile, access } = await import('node:fs/promises');
  const sql = await readFile(new URL('../../backend/store/migrations/008_voice_language.sql', import.meta.url), 'utf8');
  const ids = [...sql.matchAll(/\('([A-Za-z0-9_-]{20})', '/g)].map((m) => m[1]);
  assert.equal(ids.length, 5);
  for (const id of ids) await access(new URL(`../public${sampleUrl(id)}`, import.meta.url));
});
