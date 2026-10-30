import type { FastifyInstance } from 'fastify';

import { wallet } from '../../billing/credits.ts';
import { createPurchase, listPacks, listPurchases, payDemo } from '../../billing/purchases.ts';
import { HttpError, tooMany } from '../../util/errors.ts';
import { authOf, createRateLimiter, uuidParam, type ApiDeps } from '../context.ts';

const limitOf = (query: unknown, fallback = 50, max = 200) => {
  const n = Number.parseInt(String((query as { limit?: string } | undefined)?.limit ?? ''), 10);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), max) : fallback;
};

// Public: the marketing page shows the price list to visitors.
export function registerPublicBilling(app: FastifyInstance, deps: ApiDeps) {
  app.get('/credit-packs', async () => ({ packs: await listPacks(deps.db) }));
}

export function registerBilling(app: FastifyInstance, deps: ApiDeps) {
  const { db, config } = deps;
  // Opening checkouts is cheap to repeat by mistake, so it gets its own bucket.
  const purchaseLimit = createRateLimiter(20, 20);

  app.get('/wallet', async (req) => wallet(db, authOf(req).familyId, limitOf(req.query)));

  app.get('/purchases', async (req) => ({ purchases: await listPurchases(db, authOf(req).familyId, limitOf(req.query)) }));

  app.post('/purchases', {
    schema: {
      body: {
        type: 'object', required: ['pack_id'], additionalProperties: false,
        properties: { pack_id: { type: 'string', minLength: 2, maxLength: 32 }, idempotency_key: { type: 'string', minLength: 1, maxLength: 64 } },
      },
    },
  }, async (req, reply) => {
    const { familyId, parentId } = authOf(req);
    if (!purchaseLimit(`purchase:${parentId}`)) throw tooMany('Too many checkouts, wait a minute', purchaseLimit.retryAfter(`purchase:${parentId}`));
    const body = req.body as { pack_id: string; idempotency_key?: string };
    const out = await createPurchase(db, config, { familyId, parentId, packId: body.pack_id, idempotencyKey: body.idempotency_key ?? null });
    return reply.code(out.created ? 201 : 200).send({ purchase: out.purchase });
  });

  // Stands in for the payment provider's confirmation in the demo stage.
  app.post('/purchases/:purchaseId/demo-pay', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { outcome: { type: 'string', enum: ['success', 'decline'] } } } },
  }, async (req) => {
    const id = uuidParam((req.params as { purchaseId: string }).purchaseId, 'purchase');
    const outcome = (req.body as { outcome?: 'success' | 'decline' } | undefined)?.outcome ?? 'success';
    return payDemo(db, config, { familyId: authOf(req).familyId, purchaseId: id, outcome });
  });
}
