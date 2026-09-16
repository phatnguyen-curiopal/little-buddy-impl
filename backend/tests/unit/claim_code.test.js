import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABET, LENGTH, newClaimCode, formatClaimCode, normalizeClaimCode } from '../../devices/claim_code.js';

test('alphabet excludes the ambiguous characters', () => {
  for (const ch of 'ILOU01') assert.equal(ALPHABET.includes(ch), false, ch);
  assert.equal(ALPHABET.length, 30);
  assert.equal(new Set(ALPHABET).size, 30);
});

test('generated codes are 8 chars from the alphabet and vary', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const code = newClaimCode();
    assert.equal(code.length, LENGTH);
    for (const ch of code) assert.ok(ALPHABET.includes(ch), ch);
    seen.add(code);
  }
  assert.ok(seen.size > 45);
});

test('format inserts one dash; normalize undoes user formatting', () => {
  assert.equal(formatClaimCode('ABCDEFGH'), 'ABCD-EFGH');
  assert.equal(normalizeClaimCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeClaimCode(' ab cd ef gh '), 'ABCDEFGH');
  assert.equal(normalizeClaimCode('ABCDEFGH'), 'ABCDEFGH');
});

test('normalize rejects wrong length, ambiguous characters and non-strings', () => {
  assert.equal(normalizeClaimCode('ABCDEFG'), null);
  assert.equal(normalizeClaimCode('ABCDEFGHJ'), null);
  assert.equal(normalizeClaimCode('ABCD-EFG0'), null);
  assert.equal(normalizeClaimCode('ABCD-EFGI'), null);
  assert.equal(normalizeClaimCode(12345678), null);
  assert.equal(normalizeClaimCode(null), null);
});
