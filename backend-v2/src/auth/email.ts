// Email sign-in with a 6-digit code. Codes are stored hashed, expire in 10
// minutes and allow 5 attempts. No mail provider is wired yet: development
// returns the code in the response (EMAIL_DEV_ECHO), production refuses.

import { randomInt } from 'node:crypto';

import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { safeEqual, sha256hex } from '../util/crypto.ts';
import { findOrCreateParent } from './sessions.ts';

const hashCode = (cfg: Config, email: string, code: string) => sha256hex(`${email}:${code}:${cfg.jwtSecret}`);

export async function startEmailLogin(db: Db, cfg: Config, rawEmail: string): Promise<{ devCode?: string }> {
  const email = rawEmail.trim().toLowerCase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.query(
    `INSERT INTO email_login (email, code_hash, expires_at, attempts) VALUES ($1, $2, now() + interval '10 minutes', 0)
     ON CONFLICT (email) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [email, hashCode(cfg, email, code)],
  );
  return cfg.auth.emailDevEcho ? { devCode: code } : {};
}

export async function verifyEmailLogin(db: Db, cfg: Config, rawEmail: string, code: string): Promise<{ parentId: string; familyId: string } | null> {
  const email = rawEmail.trim().toLowerCase();
  return db.tx(async (q) => {
    const row = (
      await q.query<{ code_hash: string; attempts: number; expired: boolean }>(
        'SELECT code_hash, attempts, expires_at < now() AS expired FROM email_login WHERE email = $1 FOR UPDATE',
        [email],
      )
    ).rows[0];
    if (!row || row.expired || row.attempts >= 5) return null;
    if (!safeEqual(row.code_hash, hashCode(cfg, email, code.trim()))) {
      await q.query('UPDATE email_login SET attempts = attempts + 1 WHERE email = $1', [email]);
      return null;
    }
    await q.query('DELETE FROM email_login WHERE email = $1', [email]);
    const who = await findOrCreateParent(q, { provider: 'email', subject: email, email });
    return { parentId: who.parentId, familyId: who.familyId };
  });
}
