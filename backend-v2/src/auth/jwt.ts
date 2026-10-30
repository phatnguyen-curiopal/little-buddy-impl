// HS256 access tokens from node:crypto: 15 minutes, carrying the parent id
// and the family id, so every request can be scoped without a lookup.

import { b64url, deriveKey, fromB64url, hmacB64url, safeEqual } from '../util/crypto.ts';

export interface AccessClaims {
  sub: string;
  fam: string;
  iat: number;
  exp: number;
}

const HEADER = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
const keyFor = (secret: string) => deriveKey(secret, 'little-buddy access token v1');

export function signAccess(secret: string, claims: { sub: string; fam: string }, ttlSec: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const payload = b64url(Buffer.from(JSON.stringify({ sub: claims.sub, fam: claims.fam, iat: nowSec, exp: nowSec + ttlSec })));
  return `${HEADER}.${payload}.${hmacB64url(keyFor(secret), `${HEADER}.${payload}`)}`;
}

export function verifyAccess(secret: string, token: string, nowSec = Math.floor(Date.now() / 1000)): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  if (!safeEqual(hmacB64url(keyFor(secret), `${parts[0]}.${parts[1]}`), parts[2])) return null;
  try {
    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8')) as AccessClaims;
    if (typeof claims.sub !== 'string' || typeof claims.fam !== 'string' || typeof claims.exp !== 'number') return null;
    return claims.exp > nowSec ? claims : null;
  } catch {
    return null;
  }
}
