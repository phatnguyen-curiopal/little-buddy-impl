import config from '../config.js';
import { pool, withTransaction } from '../store/db.js';
import * as families from '../store/family.js';
import * as parents from '../store/parent.js';
import * as sessions from '../store/session.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from './password.js';
import { signAccessToken, newRefreshToken, hashToken } from './tokens.js';
import { conflict, unauthorized } from '../lib/http_error.js';
import { welcomeGrant } from '../billing/ledger.js';

function refreshExpiry() {
  return new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000);
}

async function issueTokenPair(db, parent) {
  const { token, hash } = newRefreshToken();
  await sessions.insertRefreshToken(db, { parentId: parent.id, tokenHash: hash, expiresAt: refreshExpiry() });
  const accessToken = await signAccessToken({ parentId: parent.id, familyId: parent.family_id });
  return { access_token: accessToken, refresh_token: token, expires_in: config.accessTokenTtlSec };
}

export async function register({ email, password, familyName, displayName = null }) {
  // Hash outside the transaction: scrypt is slow on purpose and must not
  // hold a connection open while it runs.
  const passwordHash = await hashPassword(password);
  try {
    return await withTransaction(async (tx) => {
      const family = await families.insert(tx, { name: familyName });
      await welcomeGrant(tx, family.id);
      const parent = await parents.insert(tx, { familyId: family.id, email, passwordHash, displayName, role: 'owner' });
      const tokens = await issueTokenPair(tx, parent);
      return { ...tokens, parent: parents.toDto(parent), family: families.toDto(family) };
    });
  } catch (err) {
    if (err.code === '23505') throw conflict('email_taken', 'an account with this email already exists');
    throw err;
  }
}

export async function login({ email, password }) {
  const parent = await parents.findByEmail(pool, email);
  // Always run the hash, even for an unknown email, so response time does not
  // reveal whether the account exists. The error body is identical too.
  const ok = await verifyPassword(password, parent ? parent.password_hash : DUMMY_HASH);
  if (!parent || !ok) throw unauthorized('invalid_credentials', 'email or password is incorrect');

  await parents.touchLastLogin(pool, parent.id);
  const family = await families.findById(pool, parent.family_id);
  const tokens = await issueTokenPair(pool, parent);
  return { ...tokens, parent: parents.toDto(parent), family: families.toDto(family) };
}

export async function refresh(rawToken) {
  // Failures are returned, not thrown, from inside the transaction: the
  // replay branch writes a revocation that must commit even though the
  // request itself fails.
  const outcome = await withTransaction(async (tx) => {
    const row = await sessions.findByHashForUpdate(tx, hashToken(rawToken));
    if (!row) return { error: unauthorized('invalid_refresh_token', 'refresh token is not recognized') };
    if (row.revoked_at) {
      // A token that was already rotated is being presented again: either the
      // client lost the new one or someone copied the old one. Both are
      // resolved by ending every session and forcing a fresh login.
      await sessions.revokeAllForParent(tx, row.parent_id);
      return { error: unauthorized('refresh_token_reused', 'refresh token was already used; please log in again') };
    }
    if (row.expires_at.getTime() < Date.now()) {
      return { error: unauthorized('refresh_token_expired', 'refresh token expired; please log in again') };
    }
    const parent = await parents.findById(tx, row.parent_id);
    if (!parent) return { error: unauthorized('invalid_refresh_token', 'refresh token is not recognized') };

    const { token, hash } = newRefreshToken();
    const fresh = await sessions.insertRefreshToken(tx, { parentId: parent.id, tokenHash: hash, expiresAt: refreshExpiry() });
    await sessions.revoke(tx, row.id, fresh.id);
    const accessToken = await signAccessToken({ parentId: parent.id, familyId: parent.family_id });
    return { tokens: { access_token: accessToken, refresh_token: token, expires_in: config.accessTokenTtlSec } };
  });
  if (outcome.error) throw outcome.error;
  return outcome.tokens;
}

// Idempotent and silent: an unknown token gets the same 204 as a known one,
// so logout cannot be used to probe which tokens exist.
export async function logout(rawToken) {
  const row = await sessions.findByHash(pool, hashToken(rawToken));
  if (row && !row.revoked_at) await sessions.revoke(pool, row.id, null);
}

export async function me(parentId) {
  const parent = await parents.findById(pool, parentId);
  if (!parent) throw unauthorized('unauthorized', 'account no longer exists');
  const family = await families.findById(pool, parent.family_id);
  return { parent: parents.toDto(parent), family: families.toDto(family) };
}
