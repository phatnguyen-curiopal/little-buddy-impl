import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import config from '../config.js';
import { unauthorized } from '../lib/http_error.js';

const ISSUER = 'littlebuddy';
const AUDIENCE = 'dashboard';
const key = new TextEncoder().encode(config.jwtSecret);

// Short-lived access JWT carrying the family id, so authenticated requests
// need no database hit. Revocation lives on the refresh token instead.
export function signAccessToken({ parentId, familyId }, { ttlSec = config.accessTokenTtlSec, now = Math.floor(Date.now() / 1000) } = {}) {
  return new SignJWT({ fam: familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(parentId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(key);
}

export async function verifyAccessToken(token) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] }));
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw unauthorized('token_expired', 'access token expired');
    throw unauthorized('unauthorized', 'invalid access token');
  }
  if (typeof payload.sub !== 'string' || typeof payload.fam !== 'string') {
    throw unauthorized('unauthorized', 'invalid access token');
  }
  return { parentId: payload.sub, familyId: payload.fam };
}

export function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

// The raw token goes to the client exactly once; only its hash is stored.
export function newRefreshToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
