import { randomInt } from 'node:crypto';

// No I, L, O, U, 0, 1: a parent types this from a printed card, and those
// are the characters people misread. 30^8 is about 39 bits, which is plenty
// for a code that is rate limited behind a login and only ever binds a toy
// to the guesser's own paying, traceable account.
export const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const LENGTH = 8;
const VALID_RE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

export function newClaimCode() {
  let code = '';
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function formatClaimCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Accepts what a parent might type (lowercase, spaces, dashes) and returns
// the canonical 8-char form, or null when the input cannot be a code.
export function normalizeClaimCode(input) {
  if (typeof input !== 'string') return null;
  const stripped = input.toUpperCase().replace(/[\s-]/g, '');
  return VALID_RE.test(stripped) ? stripped : null;
}
