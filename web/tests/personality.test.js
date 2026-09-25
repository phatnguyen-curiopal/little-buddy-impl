import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, GROUPS, QUESTIONS, scoreQuiz, groupOf, typeOf, suggestName, NAME_SUGGESTIONS } from '../src/lib/personality.js';
import { EMOTIONS } from '../src/lib/emotions.js';

const all = (x) => QUESTIONS.map(() => x);

test('16 unique types, four per group, each with a face Buddy can draw', () => {
  assert.equal(TYPES.length, 16);
  assert.equal(new Set(TYPES.map((t) => t.code)).size, 16);
  for (const g of GROUPS) assert.equal(TYPES.filter((t) => t.group === g).length, 4, g);
  for (const t of TYPES) assert.ok(EMOTIONS.includes(t.emotion), `${t.code} uses an unknown emotion`);
});

test('groups follow the letters', () => {
  assert.equal(groupOf('INTJ'), 'NT');
  assert.equal(groupOf('ENFP'), 'NF');
  assert.equal(groupOf('ISFJ'), 'SJ');
  assert.equal(groupOf('ESTP'), 'SP');
  assert.equal(typeOf('NOPE').code, 'ENFP', 'unknown codes fall back to the default');
});

test('twelve questions, three per axis', () => {
  assert.equal(QUESTIONS.length, 12);
  for (let axis = 0; axis < 4; axis += 1) assert.equal(QUESTIONS.filter((q) => q.axis === axis).length, 3);
});

test('always picking the same option does not give an extreme type', () => {
  assert.equal(scoreQuiz(all('a')), 'ESTJ');
  assert.equal(scoreQuiz(all('b')), 'INFP');
});

test('each axis is decided by the majority of its three answers', () => {
  // Answer every question so that its letter is the first of its axis
  // (E, S, T, J), then flip one E/I answer: the majority still says E.
  const toward = (letters) => QUESTIONS.map((q) => (letters.includes(q.a) ? 'a' : 'b'));
  const base = toward(['E', 'S', 'T', 'J']);
  assert.equal(scoreQuiz(base), 'ESTJ');
  const flipped = [...base];
  flipped[0] = flipped[0] === 'a' ? 'b' : 'a';
  assert.equal(scoreQuiz(flipped), 'ESTJ');
  assert.equal(scoreQuiz(toward(['I', 'N', 'F', 'P'])), 'INFP');
  assert.equal(scoreQuiz(toward(['E', 'N', 'F', 'P'])), 'ENFP');
});

test('every possible answer set yields a valid type', () => {
  const codes = new Set();
  for (let mask = 0; mask < 2 ** 12; mask += 1) {
    const answers = QUESTIONS.map((_, i) => ((mask >> i) & 1 ? 'b' : 'a'));
    codes.add(scoreQuiz(answers));
  }
  assert.equal(codes.size, 16, 'all 16 types are reachable');
  for (const code of codes) assert.ok(TYPES.some((t) => t.code === code), code);
});

test('incomplete answers are refused', () => {
  assert.throws(() => scoreQuiz(['a']));
  assert.throws(() => scoreQuiz(all('c')));
});

test('name suggestions never repeat the current name', () => {
  for (let i = 0; i < 50; i += 1) assert.notEqual(suggestName('Bin'), 'Bin');
  assert.ok(NAME_SUGGESTIONS.every((n) => n.length <= 24));
  assert.equal(suggestName('Buddy', () => 0), NAME_SUGGESTIONS.filter((n) => n !== 'Buddy')[0]);
});
