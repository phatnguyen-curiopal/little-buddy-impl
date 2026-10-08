import { Router, json } from 'express';
import * as registry from '../devices/registry.js';
import * as deviceStore from '../store/device.js';
import { requireAdmin } from '../middleware/require_admin.js';
import { validateBody, isUuid } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/http_error.js';
import * as billing from '../billing/ledger.js';
import * as voices from '../store/voice.js';
import { withTransaction } from '../store/db.js';
import { LANGUAGES, VOICE_ID_RE } from '../personalization/roles.js';

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
  // secret_revealed_at: the owning family has a web toy credential for
  // this toy. It is derived per ownership and dies on unpair, so it is an
  // audit signal, not a reason to rotate the factory secret.
  res.json({ devices: rows.map((r) => ({ ...deviceStore.toDto(r), batch_id: r.batch_id, family_id: r.family_id, secret_revealed_at: r.secret_revealed_at })) });
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

function familyId(req) {
  if (!isUuid(req.params.id)) throw notFound('family_not_found', 'family not found');
  return req.params.id.toLowerCase();
}

adminRouter.post('/families/:id/credits', async (req, res) => {
  const body = validateBody(req.body, {
    amount: { type: 'int', required: true, min: 1, max: 10000 },
    kind: { type: 'enum', values: ['grant', 'refund'] },
    reason: { type: 'string', required: true, min: 1, max: 200 },
  });
  res.json(await billing.grant({ familyId: familyId(req), amount: body.amount, kind: body.kind ?? 'grant', reason: body.reason, actorId: req.admin.id }));
});

adminRouter.get('/families/:id/wallet', async (req, res) => {
  const { findById } = await import('../store/family.js');
  const { pool } = await import('../store/db.js');
  if (!(await findById(pool, familyId(req)))) throw notFound('family_not_found', 'family not found');
  res.json(await billing.wallet(familyId(req)));
});

adminRouter.post('/devices/:id/reissue-claim-code', async (req, res) => {
  const claimCode = await registry.reissueClaimCode({ deviceId: deviceId(req), actorId: req.admin.id });
  res.json({ claim_code: claimCode });
});

// Adds a voice, or edits one (same id). language is the conversation
// language it is offered for (vi on a new voice when omitted). is_default
// moves that language's default here; profiles in that language that never
// picked a voice follow it.
adminRouter.post('/voices', async (req, res) => {
  const body = validateBody(req.body, {
    id: { type: 'string', required: true, min: 1, max: 64, pattern: VOICE_ID_RE },
    label: { type: 'string', required: true, min: 1, max: 60 },
    language: { type: 'enum', values: LANGUAGES },
    sort: { type: 'int', min: -1000, max: 1000 },
  });
  // Omitted means "leave as is" on an edit (and false on a new voice).
  const isDefault = req.body?.is_default ?? null;
  if (isDefault !== null && typeof isDefault !== 'boolean') throw badRequest('validation_error', 'invalid request body', { details: [{ field: 'is_default', message: 'must be true or false' }] });
  let row;
  try {
    row = await withTransaction((tx) => voices.upsert(tx, { id: body.id, label: body.label, language: body.language ?? null, sort: body.sort ?? null, isDefault }));
  } catch (err) {
    // Moving a default voice to a language that has one already.
    if (err.code === '23505' && /voices_one_default/.test(err.constraint ?? '')) {
      throw conflict('default_exists', 'that language already has a default voice; pass is_default: true to move it');
    }
    throw err;
  }
  res.status(row.created ? 201 : 200).json({ voice: { ...voices.toDto(row), sort: row.sort } });
});
