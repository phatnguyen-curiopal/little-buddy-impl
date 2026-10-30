import type { FastifyInstance } from 'fastify';

import { startEmailLogin, verifyEmailLogin } from '../../auth/email.ts';
import { dummyHash, hashPassword, verifyPassword } from '../../auth/password.ts';
import { welcomeGrant } from '../../billing/credits.ts';
import { OidcError, type Provider } from '../../auth/oidc.ts';
import { findOrCreateParent, issueTokens, refreshTokens, revokeRefresh } from '../../auth/sessions.ts';
import type { Queryable } from '../../db/index.ts';
import { HttpError, conflict, unauthorized } from '../../util/errors.ts';
import type { ApiDeps } from '../context.ts';

const email = { type: 'string', format: 'email', maxLength: 254 } as const;

// The account a password sign-in answers with, so the site can greet the
// parent without a second request.
async function account(q: Queryable, parentId: string) {
  const r = await q.query<{ id: string; email: string; display_name: string | null; role: string; family_id: string; family_name: string | null }>(
    `SELECT p.id, p.email, p.display_name, p.role, f.id AS family_id, f.name AS family_name
     FROM parent_user p JOIN family f ON f.id = p.family_id WHERE p.id = $1`,
    [parentId],
  );
  const row = r.rows[0];
  return { parent: { id: row.id, email: row.email, display_name: row.display_name, role: row.role }, family: { id: row.family_id, name: row.family_name } };
}

export function registerAuth(app: FastifyInstance, deps: ApiDeps) {
  app.post('/auth/email/start', {
    schema: { body: { type: 'object', required: ['email'], additionalProperties: false, properties: { email } } },
  }, async (req, reply) => {
    if (!deps.config.auth.emailDevEcho) throw new HttpError(503, 'email-unavailable', 'Email sign-in is not available yet; use Apple or Google');
    const { devCode } = await startEmailLogin(deps.db, deps.config, (req.body as { email: string }).email);
    return reply.code(202).send({ sent: true, ...(devCode ? { dev_code: devCode } : {}) });
  });

  app.post('/auth/email/verify', {
    schema: { body: { type: 'object', required: ['email', 'code'], additionalProperties: false, properties: { email, code: { type: 'string', pattern: '^[0-9]{6}$' } } } },
  }, async (req) => {
    const body = req.body as { email: string; code: string };
    const who = await verifyEmailLogin(deps.db, deps.config, body.email, body.code);
    if (!who) throw unauthorized('That code is wrong or has expired');
    return issueTokens(deps.db, deps.config, who.parentId, who.familyId);
  });

  app.post('/auth/register', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password', 'family_name'], additionalProperties: false,
        properties: {
          email,
          password: { type: 'string', minLength: 8, maxLength: 128 },
          family_name: { type: 'string', minLength: 1, maxLength: 80 },
          display_name: { type: ['string', 'null'], maxLength: 80 },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as { email: string; password: string; family_name: string; display_name?: string | null };
    const address = body.email.trim().toLowerCase();
    const hash = await hashPassword(body.password, deps.config.auth.scryptCost);
    const taken = conflict('email-taken', 'An account with this email already exists; sign in instead');
    try {
      const out = await deps.db.tx(async (q) => {
        if ((await q.query('SELECT 1 FROM parent_user WHERE lower(email) = $1', [address])).rowCount) throw taken;
        const fam = await q.query<{ id: string }>('INSERT INTO family (name) VALUES ($1) RETURNING id', [body.family_name.trim()]);
        const parent = await q.query<{ id: string }>(
          "INSERT INTO parent_user (family_id, email, display_name, auth_provider, auth_subject, password_hash) VALUES ($1, $2, $3, 'email', $2, $4) RETURNING id",
          [fam.rows[0].id, address, body.display_name?.trim() || null, hash],
        );
        await welcomeGrant(q, fam.rows[0].id, deps.config.web.welcomeCredits);
        const tokens = await issueTokens(q, deps.config, parent.rows[0].id, fam.rows[0].id);
        return { ...tokens, ...(await account(q, parent.rows[0].id)) };
      });
      return reply.code(201).send(out);
    } catch (err) {
      // Two sign-ups for one address racing: the unique index answers.
      if ((err as { code?: string }).code === '23505') throw taken;
      throw err;
    }
  });

  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password'], additionalProperties: false,
        properties: { email, password: { type: 'string', minLength: 1, maxLength: 128 } },
      },
    },
  }, async (req) => {
    const body = req.body as { email: string; password: string };
    const row = (await deps.db.query<{ id: string; family_id: string; password_hash: string | null }>(
      'SELECT id, family_id, password_hash FROM parent_user WHERE lower(email) = lower($1)',
      [body.email.trim()],
    )).rows[0];
    // An unknown email, or an account without a password, costs the same
    // work and gets the same answer as a wrong password.
    const ok = await verifyPassword(body.password, row?.password_hash ?? (await dummyHash(deps.config.auth.scryptCost)));
    if (!row?.password_hash || !ok) throw new HttpError(401, 'invalid-credentials', 'That email and password do not match');
    return deps.db.tx(async (q) => ({ ...(await issueTokens(q, deps.config, row.id, row.family_id)), ...(await account(q, row.id)) }));
  });

  app.post('/auth/oidc', {
    schema: {
      body: {
        type: 'object', required: ['provider', 'id_token'], additionalProperties: false,
        properties: { provider: { type: 'string', enum: ['apple', 'google'] }, id_token: { type: 'string', maxLength: 8192 } },
      },
    },
  }, async (req) => {
    const body = req.body as { provider: Provider; id_token: string };
    let identity: { subject: string; email: string | null };
    try {
      identity = await deps.oidc.verify(body.provider, body.id_token);
    } catch (err) {
      if (err instanceof OidcError) throw unauthorized(err.message);
      throw err;
    }
    const known = await deps.db.query<{ id: string }>('SELECT id FROM parent_user WHERE auth_provider = $1 AND auth_subject = $2', [body.provider, identity.subject]);
    if (!known.rows[0] && !identity.email) throw new HttpError(400, 'email-required', 'A verified email is needed the first time you sign in');
    return deps.db.tx(async (q) => {
      const who = await findOrCreateParent(q, { provider: body.provider, subject: identity.subject, email: identity.email ?? '', welcomeCredits: deps.config.web.welcomeCredits });
      return issueTokens(q, deps.config, who.parentId, who.familyId);
    });
  });

  app.post('/auth/refresh', {
    schema: { body: { type: 'object', required: ['refresh_token'], additionalProperties: false, properties: { refresh_token: { type: 'string', maxLength: 200 } } } },
  }, async (req) => {
    const tokens = await refreshTokens(deps.db, deps.config, (req.body as { refresh_token: string }).refresh_token);
    if (!tokens) throw unauthorized();
    return tokens;
  });

  app.post('/auth/logout', {
    schema: { body: { type: 'object', required: ['refresh_token'], additionalProperties: false, properties: { refresh_token: { type: 'string', maxLength: 200 } } } },
  }, async (req, reply) => {
    await revokeRefresh(deps.db, (req.body as { refresh_token: string }).refresh_token);
    return reply.code(204).send();
  });
}
