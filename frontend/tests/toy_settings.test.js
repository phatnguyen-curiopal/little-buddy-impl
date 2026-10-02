import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOOD_START, SETTINGS_DEFAULTS, clampMood, defaultVoice, settingsOf } from '../src/lib/toySettings.js';

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

test('the default voice is the one the backend marks', () => {
  assert.equal(defaultVoice([{ id: 'a', is_default: false }, { id: 'b', is_default: true }]).id, 'b');
  assert.equal(defaultVoice([]), null);
  assert.equal(defaultVoice(undefined), null);
});
