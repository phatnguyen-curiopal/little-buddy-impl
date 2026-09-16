import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import config from '../config.js';

const scrypt = promisify(scryptCallback);

// Built-in scrypt instead of argon2/bcrypt: no native addon, so `npm install`
// on Windows never needs Visual Studio build tools. The parameters travel in
// the stored string, so SCRYPT_COST can be raised later and old hashes still
// verify (and can be rehashed on the next login).
const KEY_LEN = 32;
const R = 8;
const P = 1;
const maxmem = (n) => 128 * n * R * 2;

const b64 = (buf) => buf.toString('base64url');

export async function hashPassword(plain, cost = config.scryptCost) {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEY_LEN, { N: cost, r: R, p: P, maxmem: maxmem(cost) });
  return `scrypt$${cost}$${R}$${P}$${b64(salt)}$${b64(key)}`;
}

// Never throws: a malformed stored value is simply "no match".
export async function verifyPassword(plain, stored) {
  try {
    const [algo, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    if (salt.length === 0 || expected.length !== KEY_LEN) return false;
    const N = Number(n);
    const key = await scrypt(plain, salt, KEY_LEN, { N, r: Number(r), p: Number(p), maxmem: maxmem(N) });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown, so a login attempt takes the
// same time whether or not the account exists.
export const DUMMY_HASH = await hashPassword('dummy-password-for-constant-time');
