import { Router, json } from 'express';
import * as registry from '../devices/registry.js';
import * as deviceStore from '../store/device.js';
import { requireAdmin } from '../middleware/require_admin.js';
import { validateBody, isUuid } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/http_error.js';

// Internal operator endpoints, mounted at /admin. Provisioning is not here
// on purpose: device secrets never cross HTTP, they go from the CLI to the
// factory manifest.
export const adminRouter = Router();

adminRouter.use(requireAdmin);
adminRouter.use(json({ limit: '16kb' }));

const STATUSES = Object.values(registry.STATUS);
const MAX_LIMIT = 200;

function deviceId(req) {
  if (!isUuid(req.params.id)) throw notFound('device_not_found', 'device not found');
  return req.params.id.toLowerCase();
}

adminRouter.get('/batches', async (req, res) => {
  res.json({ batches: await registry.listBatches() });
});

adminRouter.get('/devices', async (req, res) => {
  const { status = null, batch_id: batchId = null, family_id: familyId = null } = req.query;
  if (status !== null && !STATUSES.includes(status)) throw badRequest('validation_error', `status must be one of ${STATUSES.join(', ')}`);
  if (batchId !== null && !isUuid(batchId)) throw badRequest('validation_error', 'batch_id must be a uuid');
  if (familyId !== null && !isUuid(familyId)) throw badRequest('validation_error', 'family_id must be a uuid');
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), MAX_LIMIT);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = await registry.listDevices({ status, batchId, familyId, limit, offset });
  res.json({ devices: rows.map((r) => ({ ...deviceStore.toDto(r), batch_id: r.batch_id, family_id: r.family_id })) });
});

adminRouter.post('/devices/:id/disable', async (req, res) => {
  const body = validateBody(req.body, { reason: { type: 'string', required: true, min: 1, max: 200 } });
  const row = await registry.disable({ deviceId: deviceId(req), by: 'admin', reason: body.reason, actorId: req.admin.id });
  res.json({ device: deviceStore.toDto(row) });
});

adminRouter.post('/devices/:id/enable', async (req, res) => {
  const row = await registry.enable({ deviceId: deviceId(req), by: 'admin', actorId: req.admin.id });
  res.json({ device: deviceStore.toDto(row) });
});

adminRouter.post('/devices/:id/revoke', async (req, res) => {
  const body = validateBody(req.body, { reason: { type: 'enum', required: true, values: registry.REVOKE_REASONS } });
  const row = await registry.revoke({ deviceId: deviceId(req), reason: body.reason, actorId: req.admin.id });
  res.json({ device: deviceStore.toDto(row) });
});

adminRouter.post('/devices/:id/reissue-claim-code', async (req, res) => {
  const claimCode = await registry.reissueClaimCode({ deviceId: deviceId(req), actorId: req.admin.id });
  res.json({ claim_code: claimCode });
});
