// The database stores English codes; the model reads and writes words in
// the conversation's language. This is the only place the two meet: parse
// turns a model's word into a code (unknown -> null), render turns a code
// back into a word for the prompt.
//
// Parsing accepts the words of every language plus the codes themselves: a
// Vietnamese conversation's extractor answers "thú cưng", an English one
// "pet", and a model that echoes a code back is not wrong either.

import { textFor, LANGUAGES } from '../persona/text/index.js';

export const CODES = Object.freeze({
  nameKind: ['friend', 'pet', 'family', 'other'],
  factCategory: ['likes', 'dislikes', 'fears', 'family'],
  summaryCategory: ['family', 'school', 'friends', 'pets', 'feelings', 'daily_life', 'other'],
  valence: ['bright', 'normal', 'grey'],
});

function normalize(word) {
  return String(word ?? '').trim().toLowerCase().normalize('NFC');
}

const LOOKUP = (() => {
  const out = {};
  for (const kind of Object.keys(CODES)) {
    const map = new Map();
    for (const code of CODES[kind]) map.set(normalize(code), code);
    for (const lang of LANGUAGES) {
      for (const [code, word] of Object.entries(textFor(lang).enums[kind])) map.set(normalize(word), code);
    }
    out[kind] = map;
  }
  return out;
})();

export function toCode(kind, word) {
  return LOOKUP[kind]?.get(normalize(word)) ?? null;
}

export function toWord(kind, lang, code) {
  return textFor(lang).enums[kind]?.[code] ?? code ?? '';
}

// The word list an extractor prompt offers, in the conversation's language.
export function wordsFor(kind, lang) {
  return CODES[kind].map((code) => toWord(kind, lang, code));
}
