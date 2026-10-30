import type { FastifyInstance } from 'fastify';

import { startEmailLogin, verifyEmailLogin } from '../../auth/email.ts';
import { OidcError, type Provider } from '../../auth/oidc.ts';
import { findOrCreateParent, issueTokens, refreshTokens, revokeRefresh } from '../../auth/sessions.ts';
import { HttpError, unauthorized } from '../../util/errors.ts';
import type { ApiDeps } from '../context.ts';

const email = { type: 'string', format: 'email', maxLength: 254 } as const;

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
      const who = await findOrCreateParent(q, { provider: body.provider, subject: identity.subject, email: identity.email ?? '' });
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
