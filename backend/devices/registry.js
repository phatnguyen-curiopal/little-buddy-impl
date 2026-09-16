import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../store/db.js';
import * as devices from '../store/device.js';
import * as childrenStore from '../store/child.js';
import { newDeviceSecret, wrapSecret, unwrapSecret, claimCodeHash } from './secret_box.js';
import { newClaimCode, normalizeClaimCode, formatClaimCode } from './claim_code.js';
import { serialFor, isBatchLabel, MAX_PER_BATCH } from './serial.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/http_error.js';

// Every lifecycle transition goes through here, so the state machine is
// enforced in one place and routes cannot bypass it:
//
//   provisioned --claim--> active <--> disabled     (parent pause/resume,
//        ^                   |                        admin kill switch)
//        +------unpair-------+
//   provisioned | active | disabled --admin--> revoked   (terminal)

export const STATUS = Object.freeze({
  PROVISIONED: 'provisioned',
  ACTIVE: 'active',
  DISABLED: 'disabled',
  REVOKED: 'revoked',
});

export const REVOKE_REASONS = Object.freeze(['lost', 'stolen', 'compromised', 'retired']);

const SECRET_GRACE_DAYS = 7;

export class IllegalTransition extends Error {
  constructor(from, to) {
    super(`illegal device transition ${from} -> ${to}`);
    this.from = from;
    this.to = to;
  }
}

const TRANSITIONS = {
  provisioned: new Set(['active', 'revoked']),
  active: new Set(['disabled', 'provisioned', 'revoked']),
  disabled: new Set(['active', 'provisioned', 'revoked']),
  revoked: new Set(),
};

function assertTransition(from, to) {
  if (!TRANSITIONS[from]?.has(to)) throw new IllegalTransition(from, to);
}

// ws/stream.js registers a hook so a disable or revoke reaches an open
// stream immediately instead of at the next turn.
let onDeviceBlocked = () => {};
export function setDeviceBlockedHook(fn) {
  onDeviceBlocked = fn;
}

// The shape attached to req.device / ws.device. No secret, no claim hash.
export function toPublic(row) {
  return Object.freeze({
    id: row.id,
    serial: row.serial,
    status: row.status,
    family_id: row.family_id,
    child_id: row.child_id,
    hardware_rev: row.hardware_rev,
    batch_id: row.batch_id,
    firmware_version: row.firmware_version,
    claimed_at: row.claimed_at,
  });
}

// The only place raw secrets and claim codes are handed back, and only to the
// caller that must deliver them to the factory.
export async function provisionBatch({ label, hardwareRev, count, notes = null, actorId = null }) {
  if (!isBatchLabel(label)) throw badRequest('invalid_batch_label', 'batch label must be 3 to 16 uppercase letters or digits');
  if (typeof hardwareRev !== 'string' || !hardwareRev.trim()) throw badRequest('invalid_hardware_rev', 'hardware_rev is required');
  if (!Number.isInteger(count) || count < 1 || count > MAX_PER_BATCH) {
    throw badRequest('invalid_count', `count must be 1..${MAX_PER_BATCH}`);
  }

  const rows = [];
  const manifest = [];
  for (let i = 1; i <= count; i += 1) {
    const id = randomUUID();
    const secret = newDeviceSecret();
    const claimCode = newClaimCode();
    const serial = serialFor(label, i);
    rows.push({ id, serial, hardwareRev, secretEnc: wrapSecret(id, secret), claimCodeHash: claimCodeHash(claimCode) });
    manifest.push({
      device_id: id,
      serial,
      secret_hex: secret.toString('hex'),
      claim_code: formatClaimCode(claimCode),
      hardware_rev: hardwareRev,
      batch_label: label,
    });
  }

  try {
    const batch = await withTransaction(async (tx) => {
      const created = await devices.insertBatch(tx, { label, hardwareRev, size: count, notes });
      await devices.insertDevices(tx, rows.map((r) => ({ ...r, batchId: created.id })));
      await devices.insertEventsForBatch(tx, created.id, { event: 'provisioned', actorKind: 'factory', actorId });
      return created;
    });
    return { batch, devices: manifest };
  } catch (err) {
    if (err.code === '23505' && /device_batches/.test(err.constraint ?? '')) {
      throw conflict('batch_exists', `batch ${label} already exists`);
    }
    if (err.code === '23505') throw conflict('provision_collision', 'a generated code collided; run the batch again');
    throw err;
  }
}

export async function claimByCode({ familyId, claimCode, childId = null, actorId = null }) {
  const normalized = normalizeClaimCode(claimCode);
  if (!normalized) throw badRequest('validation_error', 'claim code must be 8 letters or digits');
  const hash = claimCodeHash(normalized);

  return withTransaction(async (tx) => {
    const row = await devices.findByClaimHashForUpdate(tx, hash);
    // Unknown, consumed, and non-provisioned all look the same on purpose.
    if (!row || row.status !== STATUS.PROVISIONED) {
      throw notFound('claim_code_invalid', 'claim code is not valid or has already been used');
    }
    if (childId) {
      const child = await childrenStore.findInFamily(tx, childId, familyId);
      if (!child) throw notFound('child_not_found', 'child not found');
    }
    assertTransition(row.status, STATUS.ACTIVE);
    const updated = await devices.claim(tx, row.id, { familyId, childId });
    await devices.insertEvent(tx, {
      deviceId: row.id,
      event: 'claimed',
      actorKind: 'parent',
      actorId,
      detail: { family_id: familyId, child_id: childId },
    });
    return updated;
  });
}

export async function assignChild({ deviceId, familyId, childId }) {
  const device = await devices.findInFamily(pool, deviceId, familyId);
  if (!device) throw notFound('device_not_found', 'device not found');
  if (childId) {
    const child = await childrenStore.findInFamily(pool, childId, familyId);
    if (!child) throw notFound('child_not_found', 'child not found');
  }
  return devices.setChild(pool, deviceId, childId);
}

async function lockDevice(tx, deviceId, familyId) {
  const row = familyId
    ? await devices.findInFamilyForUpdate(tx, deviceId, familyId)
    : await devices.findByIdForUpdate(tx, deviceId);
  if (!row) throw notFound('device_not_found', 'device not found');
  return row;
}

// `by` is 'parent' or 'admin'. A parent may only touch devices in their
// family (familyId given); an admin passes no familyId.
export async function disable({ deviceId, familyId = null, by, reason = null, actorId = null }) {
  return withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, familyId);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    if (row.status !== STATUS.ACTIVE) throw conflict('device_not_active', 'device is not active');
    assertTransition(row.status, STATUS.DISABLED);
    const updated = await devices.setStatus(tx, row.id, { status: STATUS.DISABLED, statusReason: reason, disabledBy: by });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'disabled', actorKind: by, actorId });
    onDeviceBlocked(row.id, STATUS.DISABLED);
    return updated;
  });
}

export async function enable({ deviceId, familyId = null, by, actorId = null }) {
  return withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, familyId);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    if (row.status !== STATUS.DISABLED) throw conflict('device_not_disabled', 'device is not disabled');
    // An operator kill switch is not something a parent can undo.
    if (by === 'parent' && row.disabled_by === 'admin') {
      throw forbidden('disabled_by_operator', 'this device was disabled by the operator; contact support');
    }
    assertTransition(row.status, STATUS.ACTIVE);
    const updated = await devices.setStatus(tx, row.id, { status: STATUS.ACTIVE });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'enabled', actorKind: by, actorId });
    return updated;
  });
}

// Back to provisioned: the printed claim code becomes valid again, so a
// gifted or resold toy is claimed with the card it came with.
export async function unpair({ deviceId, familyId, actorId = null }) {
  return withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, familyId);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    assertTransition(row.status, STATUS.PROVISIONED);
    const updated = await devices.unpair(tx, row.id);
    await devices.insertEvent(tx, {
      deviceId: row.id,
      event: 'unpaired',
      actorKind: 'parent',
      actorId,
      detail: { family_id: familyId },
    });
    onDeviceBlocked(row.id, STATUS.PROVISIONED);
    return updated;
  });
}

export async function revoke({ deviceId, reason, actorId = null }) {
  if (!REVOKE_REASONS.includes(reason)) {
    throw badRequest('validation_error', `reason must be one of ${REVOKE_REASONS.join(', ')}`);
  }
  return withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, null);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is already revoked');
    assertTransition(row.status, STATUS.REVOKED);
    const updated = await devices.setStatus(tx, row.id, { status: STATUS.REVOKED, statusReason: reason });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'revoked', actorKind: 'admin', actorId, detail: { reason } });
    onDeviceBlocked(row.id, STATUS.REVOKED);
    return updated;
  });
}

// For a lost card. Returns the new formatted code exactly once.
export async function reissueClaimCode({ deviceId, actorId = null }) {
  return withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, null);
    if (row.status !== STATUS.PROVISIONED) throw conflict('device_already_claimed', 'only an unclaimed device can get a new claim code');
    const code = newClaimCode();
    await devices.setClaimHash(tx, row.id, claimCodeHash(code));
    await devices.insertEvent(tx, { deviceId: row.id, event: 'claim_code_reissued', actorKind: 'admin', actorId });
    return formatClaimCode(code);
  });
}

// A bench operation: the new secret is reflashed by hand, and the old one
// keeps working for a grace period so the server row can change first.
export async function rotateSecret({ deviceId, actorId = null, graceDays = SECRET_GRACE_DAYS }) {
  return withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, null);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    const secret = newDeviceSecret();
    await devices.setSecrets(tx, row.id, {
      secretEnc: wrapSecret(row.id, secret),
      secretPrevEnc: row.secret_enc,
      secretPrevExpiresAt: new Date(Date.now() + graceDays * 86_400_000),
    });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'secret_rotated', actorKind: 'admin', actorId });
    return { device_id: row.id, serial: row.serial, secret_hex: secret.toString('hex') };
  });
}

export async function heartbeat({ deviceId, firmwareVersion = null }) {
  await devices.touchSeen(pool, deviceId, firmwareVersion);
}

// Only devices/hmac_auth.js calls this: it is the one path that decrypts.
export async function getForAuth(deviceId) {
  const row = await devices.findById(pool, deviceId);
  if (!row) return null;
  const secret = unwrapSecret(row.id, row.secret_enc);
  const prevValid = row.secret_prev_enc && row.secret_prev_expires_at && row.secret_prev_expires_at.getTime() > Date.now();
  const prevSecret = prevValid ? unwrapSecret(row.id, row.secret_prev_enc) : null;
  return { device: toPublic(row), secret, prevSecret };
}

export async function getInFamily({ deviceId, familyId }) {
  const row = await devices.findInFamily(pool, deviceId, familyId);
  if (!row) throw notFound('device_not_found', 'device not found');
  return row;
}

export function listForFamily(familyId) {
  return devices.listByFamily(pool, familyId);
}

export function listBatches() {
  return devices.listBatches(pool);
}

export function listDevices(filters) {
  return devices.listDevices(pool, filters);
}

export function listEvents(deviceId) {
  return devices.listEvents(pool, deviceId);
}

export async function getById(deviceId) {
  const row = await devices.findById(pool, deviceId);
  return row ? toPublic(row) : null;
}
