import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile, DEFAULT_PROFILE, ROLES } from '../../personalization/roles.js';

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
  assert.deepEqual(out, { name: 'Bin Bin', role: 'teacher', personality: 'INTJ', personality_source: 'quiz' });
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
  assert.deepEqual({ ...DEFAULT_PROFILE }, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default' });
  assert.deepEqual(Object.keys(ROLES), ['friend', 'daddy', 'mommy', 'teacher']);
  assert.match(ROLES.friend.pronouns, /"tớ".*"cậu"/);
});
