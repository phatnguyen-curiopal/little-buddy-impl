import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CODES, toCode, toWord, wordsFor } from '../../memory/enums.js';

test('the prototype Vietnamese values map to English codes', () => {
  assert.equal(toCode('nameKind', 'thú cưng'), 'pet');
  assert.equal(toCode('nameKind', 'người thân'), 'family');
  assert.equal(toCode('nameKind', 'bạn'), 'friend');
  assert.equal(toCode('factCategory', 'không thích'), 'dislikes');
  assert.equal(toCode('factCategory', 'nỗi sợ'), 'fears');
  assert.equal(toCode('summaryCategory', 'trường lớp'), 'school');
  assert.equal(toCode('summaryCategory', 'đời sống'), 'daily_life');
  assert.equal(toCode('valence', 'xám'), 'grey');
});

test('English words and the codes themselves parse too, case and spacing ignored', () => {
  assert.equal(toCode('nameKind', ' Pet '), 'pet');
  assert.equal(toCode('summaryCategory', 'daily life'), 'daily_life');
  assert.equal(toCode('summaryCategory', 'daily_life'), 'daily_life');
  assert.equal(toCode('factCategory', 'Likes'), 'likes');
});

test('unknown words are null, never a guess', () => {
  assert.equal(toCode('factCategory', 'sự kiện'), null);
  assert.equal(toCode('nameKind', 'hàng xóm'), null);
  assert.equal(toCode('nameKind', undefined), null);
});

test('codes render back in the conversation language', () => {
  assert.equal(toWord('nameKind', 'vi', 'pet'), 'thú cưng');
  assert.equal(toWord('nameKind', 'en', 'pet'), 'pet');
  assert.equal(toWord('summaryCategory', 'vi', 'feelings'), 'cảm xúc');
  assert.deepEqual(wordsFor('summaryCategory', 'vi'), ['gia đình', 'trường lớp', 'bạn bè', 'thú cưng', 'cảm xúc', 'đời sống', 'khác']);
});

test('every code round-trips through every language', () => {
  for (const [kind, codes] of Object.entries(CODES)) {
    for (const lang of ['vi', 'en']) {
      for (const code of codes) assert.equal(toCode(kind, toWord(kind, lang, code)), code, `${kind}/${lang}/${code}`);
    }
  }
});
