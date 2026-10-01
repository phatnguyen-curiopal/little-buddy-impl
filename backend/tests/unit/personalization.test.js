import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile, DEFAULT_PROFILE, DEFAULT_SETTINGS, ROLES } from '../../personalization/roles.js';

const fields = (fn) => {
  try {
    fn();
  } catch (err) {
    assert.equal(err.status, 400);
    return err.extra.details.map((d) => d.field).sort();
  }
  assert.fail('expected a 400');
};

test('a full profile is cleaned: name trimmed and collapsed, code uppercased', () => {
  const out = validateProfile({ name: '  Bin   Bin ', role: 'teacher', personality: 'intj', personality_source: 'quiz' });
  assert.deepEqual(out, { name: 'Bin Bin', role: 'teacher', personality: 'INTJ', personality_source: 'quiz', ...DEFAULT_SETTINGS });
});

test('a full profile without a source counts as picked', () => {
  assert.equal(validateProfile({ name: 'Mít', role: 'friend', personality: 'ENFP' }).personality_source, 'picked');
});

test('every bad field is reported at once', () => {
  assert.deepEqual(fields(() => validateProfile({ name: '', role: 'pirate', personality: 'ABCD', personality_source: 'magic' })), ['name', 'personality', 'personality_source', 'role']);
  assert.deepEqual(fields(() => validateProfile({ name: 'x'.repeat(25), role: 'friend', personality: 'ENFP' })), ['name']);
  assert.deepEqual(fields(() => validateProfile({ name: 'Bin\u0007', role: 'friend', personality: 'ENFP' })), ['name']);
  assert.deepEqual(fields(() => validateProfile(null)), ['name', 'personality', 'role']);
});

test('partial updates accept any subset but not nothing', () => {
  assert.deepEqual(validateProfile({ name: 'Kem' }, { partial: true }), { name: 'Kem' });
  assert.deepEqual(validateProfile({ personality: 'isfj', personality_source: 'picked' }, { partial: true }), { personality: 'ISFJ', personality_source: 'picked' });
  assert.deepEqual(fields(() => validateProfile({}, { partial: true })), ['profile']);
});

test('defaults and roles match the prototype friend persona and the four spec roles', () => {
  assert.deepEqual({ ...DEFAULT_PROFILE }, {
    name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default',
    language: 'vi', voice_id: null, learn: false, mood_pin: null,
  });
  assert.deepEqual(Object.keys(ROLES), ['friend', 'daddy', 'mommy', 'teacher']);
  // The brain owns the prompt; the backend keeps codes and labels only.
  for (const role of Object.values(ROLES)) assert.deepEqual(Object.keys(role), ['label']);
});

test('settings: a full profile can carry them, and bad ones are listed with the rest', () => {
  const out = validateProfile({ name: 'Kem', role: 'mommy', personality: 'ISFP', language: 'en', voice_id: 'abcDEF_12-3', learn: true, mood_pin: 0 });
  assert.deepEqual(
    { language: out.language, voice_id: out.voice_id, learn: out.learn, mood_pin: out.mood_pin },
    { language: 'en', voice_id: 'abcDEF_12-3', learn: true, mood_pin: 0 },
  );
  assert.deepEqual(
    fields(() => validateProfile({ name: 'Kem', role: 'friend', personality: 'ENFP', language: 'fr', voice_id: 'bad id!', learn: 'yes', mood_pin: 101 })),
    ['language', 'learn', 'mood_pin', 'voice_id'],
  );
  assert.deepEqual(fields(() => validateProfile({ mood_pin: -1 }, { partial: true })), ['mood_pin']);
  assert.deepEqual(fields(() => validateProfile({ mood_pin: 12.5 }, { partial: true })), ['mood_pin']);
  assert.deepEqual(fields(() => validateProfile({ voice_id: 42 }, { partial: true })), ['voice_id']);
});

test('partial: null is a value for voice_id and mood_pin, 0 is a real pin, absent is untouched', () => {
  assert.deepEqual(validateProfile({ mood_pin: null }, { partial: true }), { mood_pin: null });
  assert.deepEqual(validateProfile({ mood_pin: 0 }, { partial: true }), { mood_pin: 0 });
  assert.deepEqual(validateProfile({ voice_id: null, learn: false }, { partial: true }), { voice_id: null, learn: false });
  assert.deepEqual(validateProfile({ language: 'en', name: undefined }, { partial: true }), { language: 'en' });
});
