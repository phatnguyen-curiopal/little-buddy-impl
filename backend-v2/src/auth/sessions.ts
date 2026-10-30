// Parent sessions: opaque refresh tokens stored as sha256, rotated on every
// use. Presenting a token that was already rotated means it leaked, so every
// session of that parent ends.

import { welcomeGrant } from '../billing/credits.ts';
import type { Config } from '../config.ts';
import type { Db, Queryable } from '../db/index.ts';
import { randomToken, sha256hex } from '../util/crypto.ts';
import { signAccess } from './jwt.ts';

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export async function issueTokens(q: Queryable, cfg: Config, parentId: string, familyId: string): Promise<Tokens> {
  const refresh = `rt_${randomToken(32)}`;
  await q.query(
    "INSERT INTO refresh_token (parent_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))",
    [parentId, sha256hex(refresh), cfg.auth.refreshTtlDays],
  );
  await q.query('UPDATE parent_user SET last_login_at = now() WHERE id = $1', [parentId]);
  return {
    access_token: signAccess(cfg.jwtSecret, { sub: parentId, fam: familyId }, cfg.auth.accessTtlSec),
    refresh_token: refresh,
    token_type: 'Bearer',
    expires_in: cfg.auth.accessTtlSec,
  };
}

export async function refreshTokens(db: Db, cfg: Config, token: string): Promise<Tokens | null> {
  // The reuse branch must commit its revocation, so it returns null from the
  // transaction instead of throwing (a throw would roll the revocation back).
  return db.tx(async (q) => {
    const row = (
      await q.query<{ id: string; parent_id: string; family_id: string; replaced_by: string | null; revoked_at: Date | null; expired: boolean }>(
        `SELECT r.id, r.parent_id, p.family_id, r.replaced_by, r.revoked_at, r.expires_at < now() AS expired
         FROM refresh_token r JOIN parent_user p ON p.id = r.parent_id
         WHERE r.token_hash = $1 FOR UPDATE OF r`,
        [sha256hex(token)],
      )
    ).rows[0];
    if (!row) return null;
    if (row.replaced_by || row.revoked_at) {
      await q.query('UPDATE refresh_token SET revoked_at = now() WHERE parent_id = $1 AND revoked_at IS NULL', [row.parent_id]);
      return null;
    }
    if (row.expired) return null;
    const tokens = await issueTokens(q, cfg, row.parent_id, row.family_id);
    const next = await q.query<{ id: string }>('SELECT id FROM refresh_token WHERE token_hash = $1', [sha256hex(tokens.refresh_token)]);
    await q.query('UPDATE refresh_token SET replaced_by = $2 WHERE id = $1', [row.id, next.rows[0].id]);
    return tokens;
  });
}

export async function revokeRefresh(q: Queryable, token: string): Promise<void> {
  await q.query('UPDATE refresh_token SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256hex(token)]);
}

// Signs in an existing parent or creates the family and parent on first sign-in.
// A verified email links providers, so Apple and email sign-in reach one account.
// Every caller has just proved the address is theirs (an emailed code, or an
// Apple or Google token that says the email is verified).
export async function findOrCreateParent(q: Queryable, who: { provider: 'email' | 'apple' | 'google'; subject: string; email: string; welcomeCredits?: number }): Promise<{ parentId: string; familyId: string; created: boolean }> {
  const bySubject = await q.query<{ id: string; family_id: string }>(
    'SELECT id, family_id FROM parent_user WHERE auth_provider = $1 AND auth_subject = $2',
    [who.provider, who.subject],
  );
  if (bySubject.rows[0]) return { parentId: bySubject.rows[0].id, familyId: bySubject.rows[0].family_id, created: false };
  const byEmail = await q.query<{ id: string; family_id: string; email_verified_at: Date | null }>(
    'SELECT id, family_id, email_verified_at FROM parent_user WHERE lower(email) = lower($1)',
    [who.email],
  );
  const found = byEmail.rows[0];
  if (found) {
    // An account that only typed this address (a password sign-up) is taken
    // over, not joined: its password and sessions end, so someone who signed
    // up with another person's email first keeps no way in. Access tokens
    // already out lapse within their 15 minutes.
    if (!found.email_verified_at) {
      await q.query('UPDATE parent_user SET password_hash = NULL, email_verified_at = now() WHERE id = $1', [found.id]);
      await q.query('UPDATE refresh_token SET revoked_at = now() WHERE parent_id = $1 AND revoked_at IS NULL', [found.id]);
    }
    return { parentId: found.id, familyId: found.family_id, created: false };
  }
  const fam = await q.query<{ id: string }>('INSERT INTO family DEFAULT VALUES RETURNING id');
  const parent = await q.query<{ id: string }>(
    'INSERT INTO parent_user (family_id, email, auth_provider, auth_subject, email_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id',
    [fam.rows[0].id, who.email.toLowerCase(), who.provider, who.subject],
  );
  await welcomeGrant(q, fam.rows[0].id, who.welcomeCredits ?? 0);
  return { parentId: parent.rows[0].id, familyId: fam.rows[0].id, created: true };
}
