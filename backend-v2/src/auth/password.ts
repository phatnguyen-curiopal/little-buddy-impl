// Password hashes with node:crypto's scrypt: no native addon to build. The
// parameters travel in the stored string, so the cost can rise later and old
// hashes still verify.

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LEN = 32;
const R = 8;
const P = 1;
const maxmem = (n: number) => 128 * n * R * 2;

function scrypt(plain: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(plain, salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(plain: string, cost: number): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, { N: cost, r: R, p: P, maxmem: maxmem(cost) });
  return `scrypt$${cost}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

// Never throws: a malformed stored value is simply no match.
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [algo, n, r, p, salt64, hash64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(salt64, 'base64url');
    const expected = Buffer.from(hash64, 'base64url');
    if (!salt.length || expected.length !== KEY_LEN) return false;
    const N = Number(n);
    const key = await scrypt(plain, salt, { N, r: Number(r), p: Number(p), maxmem: maxmem(N) });
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

// Checked against when the email is unknown, so a failed sign-in takes the
// same time whether or not the account exists. Made once per cost.
const dummies = new Map<number, Promise<string>>();
export function dummyHash(cost: number): Promise<string> {
  let hash = dummies.get(cost);
  if (!hash) {
    hash = hashPassword('dummy-password-for-constant-time', cost);
    dummies.set(cost, hash);
  }
  return hash;
}
