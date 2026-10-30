import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { verifyAccess } from '../auth/jwt.ts';
import { HttpError, tooMany, unauthorized } from '../util/errors.ts';
import { createRateLimiter, type ApiDeps, type Authed } from './context.ts';
import { registerAccount } from './routes/account.ts';
import { registerAuth } from './routes/auth.ts';
import { registerBilling, registerPublicBilling } from './routes/billing.ts';
import { registerBuddy } from './routes/buddy.ts';
import { registerChildren } from './routes/children.ts';
import { registerMemory } from './routes/memory.ts';
import { registerParent } from './routes/parent.ts';
import { registerWeb } from './routes/web.ts';

export function buildApi(deps: ApiDeps): FastifyInstance {
  const hops = deps.config.trustProxy;
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, trustProxy: hops > 0 ? (_address: string, hop: number) => hop < hops : false });
  const parentLimit = createRateLimiter(60, 120);
  const signInLimit = createRateLimiter(10, 20);
  // Each sign-up mints welcome credits, so new accounts come slowly; token
  // refreshes come from every open tab and must not eat sign-in attempts.
  const signUpLimit = createRateLimiter(5 / 60, 5);
  const refreshLimit = createRateLimiter(60, 120);
  const publicLimit = createRateLimiter(60, 120);
  const pairLimit = createRateLimiter(10 / 60, 10);

  app.decorateRequest('auth', null);

  app.setErrorHandler((err: Error & { validation?: { instancePath: string; keyword: string; params?: Record<string, unknown> }[]; statusCode?: number }, req, reply) => {
    const send = (status: number, code: string, title: string, errors?: unknown) =>
      reply.code(status).type('application/problem+json').send({ type: `/problems/${code}`, title, status, ...(errors ? { errors } : {}) });
    if (err instanceof HttpError) {
      if (err.retryAfter) reply.header('retry-after', String(err.retryAfter));
      return send(err.status, err.code, err.message, err.errors);
    }
    if (err.validation) {
      const errors = err.validation.map((v) => ({
        field: v.instancePath.replace(/^\//, '').replace(/\//g, '.') || String(v.params?.missingProperty ?? ''),
        code: v.keyword,
      }));
      return send(400, 'invalid-request', 'Some fields are not valid', errors);
    }
    if (err.statusCode && err.statusCode < 500) return send(err.statusCode, 'invalid-request', err.message);
    deps.log.error('api error', { route: req.routeOptions?.url, error: err });
    return send(500, 'internal', 'Something went wrong');
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).type('application/problem+json').send({ type: '/problems/not-found', title: 'No such endpoint', status: 404 }));

  app.get('/healthz', async () => ({ ok: true }));

  // Sign-in routes: rate limited per IP, no token.
  app.register(async (scope) => {
    scope.addHook('onRequest', async (req) => {
      const path = req.url.split('?')[0];
      const limit = path.endsWith('/auth/register') ? signUpLimit : path.endsWith('/auth/refresh') || path.endsWith('/auth/logout') ? refreshLimit : signInLimit;
      if (!limit(`ip:${req.ip}`)) throw tooMany('Too many attempts, wait a little', limit.retryAfter(`ip:${req.ip}`));
    });
    registerAuth(scope, deps);
  }, { prefix: '/v1' });

  // Public reads for the marketing page: no token, a looser limit per visitor.
  app.register(async (scope) => {
    scope.addHook('onRequest', async (req) => {
      if (!publicLimit(`ip:${req.ip}`)) throw tooMany('Too many requests, wait a minute', publicLimit.retryAfter(`ip:${req.ip}`));
    });
    registerPublicBilling(scope, deps);
  }, { prefix: '/v1' });

  // Everything else: a valid access token, rate limited per parent.
  app.register(async (scope) => {
    scope.addHook('preHandler', async (req: FastifyRequest) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw unauthorized();
      const claims = verifyAccess(deps.config.jwtSecret, header.slice(7));
      if (!claims) throw unauthorized();
      (req as Authed).auth = { parentId: claims.sub, familyId: claims.fam };
      if (!parentLimit(`parent:${claims.sub}`)) throw tooMany('Too many requests, wait a minute', parentLimit.retryAfter(`parent:${claims.sub}`));
    });
    registerAccount(scope, deps);
    registerChildren(scope, { ...deps, pairLimit });
    registerBuddy(scope, deps);
    registerMemory(scope, deps);
    registerParent(scope, deps);
    registerBilling(scope, deps);
    registerWeb(scope, { ...deps, pairLimit });
  }, { prefix: '/v1' });

  return app;
}
