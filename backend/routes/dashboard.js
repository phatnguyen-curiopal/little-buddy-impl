import { Router, json } from 'express';
import * as auth from '../auth/service.js';
import { requireParent } from '../middleware/require_parent.js';
import { rateLimit, emailKey } from '../middleware/rate_limit.js';
import { validateBody } from '../lib/validate.js';
import { pool } from '../store/db.js';
import * as children from '../store/child.js';
import * as registry from '../devices/registry.js';
import * as deviceStore from '../store/device.js';
import { isUuid } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/http_error.js';
import * as billing from '../billing/ledger.js';
import * as buying from '../billing/purchases.js';
import * as turns from '../turns/service.js';

// Everything the parent web app calls, mounted at /api. Never mixed with the
// device API: a device secret must not be able to reach any of these.
export const dashboardRouter = Router();

dashboardRouter.use(json({ limit: '64kb' }));

const registerLimit = rateLimit({ name: 'register', limit: 5, windowSec: 3600, key: (req) => req.ip });
const loginLimit = rateLimit({
  name: 'login',
  limit: 10,
  windowSec: 900,
  key: (req) => `${req.ip}:${emailKey(req.body?.email)}`,
});

dashboardRouter.post('/auth/register', registerLimit, async (req, res) => {
  const body = validateBody(req.body, {
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 8, max: 128, trim: false },
    family_name: { type: 'string', required: true, min: 1, max: 80 },
    display_name: { type: 'string', max: 80 },
  });
  const result = await auth.register({
    email: body.email,
    password: body.password,
    familyName: body.family_name,
    displayName: body.display_name ?? null,
  });
  res.status(201).json(result);
});

dashboardRouter.post('/auth/login', loginLimit, async (req, res) => {
  const body = validateBody(req.body, {
    email: { type: 'email', required: true },
    password: { type: 'string', required: true, min: 1, max: 128, trim: false },
  });
  res.json(await auth.login(body));
});

dashboardRouter.post('/auth/refresh', async (req, res) => {
  const body = validateBody(req.body, { refresh_token: { type: 'string', required: true, min: 1, max: 512 } });
  res.json(await auth.refresh(body.refresh_token));
});

dashboardRouter.post('/auth/logout', async (req, res) => {
  const body = validateBody(req.body, { refresh_token: { type: 'string', required: true, min: 1, max: 512 } });
  await auth.logout(body.refresh_token);
  res.status(204).end();
});

dashboardRouter.get('/me', requireParent, async (req, res) => {
  res.json(await auth.me(req.parent.id));
});

dashboardRouter.post('/children', requireParent, async (req, res) => {
  const body = validateBody(req.body, {
    name: { type: 'string', required: true, min: 1, max: 40 },
    birth_year: { type: 'int', required: true, min: 2000, max: 2100 },
  });
  const child = await children.insert(pool, { familyId: req.familyId, name: body.name, birthYear: body.birth_year });
  res.status(201).json({ child: children.toDto(child) });
});

dashboardRouter.get('/children', requireParent, async (req, res) => {
  const rows = await children.listByFamily(pool, req.familyId);
  res.json({ children: rows.map(children.toDto) });
});

// Claim codes are ~39 bits; this limit is what makes guessing them futile.
const claimLimit = rateLimit({ name: 'claim', limit: 10, windowSec: 3600, key: (req) => req.parent.id });

function deviceId(req) {
  if (!isUuid(req.params.id)) throw notFound('device_not_found', 'device not found');
  return req.params.id.toLowerCase();
}

const deviceResponse = (row) => ({ device: deviceStore.toDto(row) });

dashboardRouter.post('/devices/claim', requireParent, claimLimit, async (req, res) => {
  const body = validateBody(req.body, {
    claim_code: { type: 'string', required: true, min: 8, max: 12 },
    child_id: { type: 'uuid', nullable: true },
  });
  const row = await registry.claimByCode({
    familyId: req.familyId,
    claimCode: body.claim_code,
    childId: body.child_id ?? null,
    actorId: req.parent.id,
  });
  res.json(deviceResponse(row));
});

dashboardRouter.get('/devices', requireParent, async (req, res) => {
  const rows = await registry.listForFamily(req.familyId);
  res.json({ devices: rows.map(deviceStore.toDto) });
});

dashboardRouter.patch('/devices/:id', requireParent, async (req, res) => {
  const body = validateBody(req.body, { child_id: { type: 'uuid', nullable: true } });
  if (body.child_id === undefined) throw badRequest('validation_error', 'child_id is required (uuid or null)');
  const row = await registry.assignChild({ deviceId: deviceId(req), familyId: req.familyId, childId: body.child_id });
  res.json(deviceResponse(row));
});

dashboardRouter.post('/devices/:id/disable', requireParent, async (req, res) => {
  const body = validateBody(req.body, { reason: { type: 'string', max: 200 } });
  const row = await registry.disable({
    deviceId: deviceId(req),
    familyId: req.familyId,
    by: 'parent',
    reason: body.reason ?? null,
    actorId: req.parent.id,
  });
  res.json(deviceResponse(row));
});

dashboardRouter.post('/devices/:id/enable', requireParent, async (req, res) => {
  const row = await registry.enable({ deviceId: deviceId(req), familyId: req.familyId, by: 'parent', actorId: req.parent.id });
  res.json(deviceResponse(row));
});

dashboardRouter.delete('/devices/:id', requireParent, async (req, res) => {
  await registry.unpair({ deviceId: deviceId(req), familyId: req.familyId, actorId: req.parent.id });
  res.status(204).end();
});

function limitParam(req, fallback = 50, max = 200) {
  const n = Number(req.query.limit);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}

dashboardRouter.get('/wallet', requireParent, async (req, res) => {
  res.json(await billing.wallet(req.familyId, { limit: limitParam(req) }));
});

dashboardRouter.get('/credit-packs', requireParent, async (req, res) => {
  res.json({ packs: await buying.listPacks() });
});

dashboardRouter.get('/purchases', requireParent, async (req, res) => {
  res.json({ purchases: await buying.listPurchases(req.familyId, limitParam(req)) });
});

const purchaseLimit = rateLimit({ name: 'purchase', limit: 20, windowSec: 3600, key: (req) => req.parent.id });

dashboardRouter.post('/purchases', requireParent, purchaseLimit, async (req, res) => {
  const body = validateBody(req.body, {
    pack_id: { type: 'string', required: true, min: 2, max: 32 },
    idempotency_key: { type: 'string', min: 1, max: 64 },
  });
  const { purchase, created } = await buying.createPurchase({
    familyId: req.familyId,
    parentId: req.parent.id,
    packId: body.pack_id,
    idempotencyKey: body.idempotency_key ?? null,
  });
  res.status(created ? 201 : 200).json({ purchase });
});

// Stands in for the payment provider's confirmation in the demo stage.
dashboardRouter.post('/purchases/:id/demo-pay', requireParent, async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound('purchase_not_found', 'purchase not found');
  const body = validateBody(req.body, { outcome: { type: 'enum', values: ['success', 'decline'] } });
  res.json(await buying.payDemo({ familyId: req.familyId, purchaseId: req.params.id.toLowerCase(), outcome: body.outcome ?? 'success' }));
});

// The parent sees why a turn was refused; the toy never does.
dashboardRouter.get('/turns', requireParent, async (req, res) => {
  res.json({ turns: await turns.listForFamily(req.familyId, limitParam(req)) });
});
