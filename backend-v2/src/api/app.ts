import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import { verifyAccess } from '../auth/jwt.ts';
import { HttpError, unauthorized } from '../util/errors.ts';
import { createRateLimiter, type ApiDeps, type Authed } from './context.ts';
import { registerAccount } from './routes/account.ts';
import { registerAuth } from './routes/auth.ts';
import { registerBuddy } from './routes/buddy.ts';
import { registerChildren } from './routes/children.ts';
import { registerMemory } from './routes/memory.ts';
import { registerParent } from './routes/parent.ts';

export function buildApi(deps: ApiDeps): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  const parentLimit = createRateLimiter(60, 120);
  const signInLimit = createRateLimiter(10, 20);

  app.decorateRequest('auth', null);

  app.setErrorHandler((err: Error & { validation?: { instancePath: string; keyword: string; params?: Record<string, unknown> }[]; statusCode?: number }, req, reply) => {
    const send = (status: number, code: string, title: string, errors?: unknown) =>
      reply.code(status).type('application/problem+json').send({ type: `/problems/${code}`, title, status, ...(errors ? { errors } : {}) });
    if (err instanceof HttpError) return send(err.status, err.code, err.message, err.errors);
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
      if (!signInLimit(`ip:${req.ip}`)) throw new HttpError(429, 'rate-limited', 'Too many attempts, wait a minute');
    });
    registerAuth(scope, deps);
  }, { prefix: '/v1' });

  // Everything else: a valid access token, rate limited per parent.
  app.register(async (scope) => {
    scope.addHook('preHandler', async (req: FastifyRequest) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw unauthorized();
      const claims = verifyAccess(deps.config.jwtSecret, header.slice(7));
      if (!claims) throw unauthorized();
      (req as Authed).auth = { parentId: claims.sub, familyId: claims.fam };
      if (!parentLimit(`parent:${claims.sub}`)) throw new HttpError(429, 'rate-limited', 'Too many requests, wait a minute');
    });
    registerAccount(scope, deps);
    registerChildren(scope, deps);
    registerBuddy(scope, deps);
    registerMemory(scope, deps);
    registerParent(scope, deps);
  }, { prefix: '/v1' });

  return app;
}
