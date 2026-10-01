import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../store/db.js';
import * as devices from '../store/device.js';
import * as childrenStore from '../store/child.js';
import * as profiles from '../store/profile.js';
import { DEFAULT_PROFILE, validateProfile, isVoiceFkError, unknownVoice } from '../personalization/roles.js';
import { pipeline } from '../pipeline/index.js';
import log from '../lib/log.js';
import { newDeviceSecret, wrapSecret, unwrapSecret, claimCodeHash, webToySecret } from './secret_box.js';
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
// caller that must deliver them to the factory. `beforeCommit(manifest)` runs
// inside the transaction after the rows exist: the CLI writes the manifest
// there, so a failed write rolls the batch back and no device ever exists
// whose secret was lost.
export async function provisionBatch({ label, hardwareRev, count, notes = null, actorId = null, beforeCommit = null }) {
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
      if (beforeCommit) await beforeCommit(manifest, created);
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

// A voice id of the right shape that names no voice fails the foreign key
// inside the transaction; the parent sees it as a field error, not a 500.
async function mapVoiceError(promise) {
  try {
    return await promise;
  } catch (err) {
    if (isVoiceFkError(err)) throw unknownVoice();
    throw err;
  }
}

// The profile (name, role, personality and conversation settings) is
// written in the same transaction, so a claimed toy always has one; omitted
// fields mean the defaults.
export async function claimByCode({ familyId, claimCode, childId = null, profile = null, actorId = null }) {
  const normalized = normalizeClaimCode(claimCode);
  if (!normalized) throw badRequest('validation_error', 'claim code must be 8 letters or digits');
  const chosen = profile ? validateProfile(profile) : DEFAULT_PROFILE;
  const hash = claimCodeHash(normalized);

  return mapVoiceError(withTransaction(async (tx) => {
    const row = await devices.findByClaimHashForUpdate(tx, hash);
    // A retry after a lost response must not look like a bad code. Only the
    // owning family gets its toy back, unchanged; nothing is written, so the
    // profile chosen since is kept.
    if (row && row.family_id === familyId && (row.status === STATUS.ACTIVE || row.status === STATUS.DISABLED)) {
      return devices.findInFamily(tx, row.id, familyId);
    }
    // Unknown, consumed, and non-provisioned all look the same on purpose.
    if (!row || row.status !== STATUS.PROVISIONED) {
      throw notFound('claim_code_invalid', 'claim code is not valid or has already been used');
    }
    if (childId) {
      const child = await childrenStore.findInFamily(tx, childId, familyId);
      if (!child) throw notFound('child_not_found', 'child not found');
    }
    assertTransition(row.status, STATUS.ACTIVE);
    await devices.claim(tx, row.id, { familyId, childId });
    await profiles.upsert(tx, row.id, chosen);
    await devices.insertEvent(tx, {
      deviceId: row.id,
      event: 'claimed',
      actorKind: 'parent',
      actorId,
      detail: { family_id: familyId, child_id: childId },
    });
    return devices.findInFamily(tx, row.id, familyId);
  }));
}

// Rename Buddy, change how it speaks to the child, or its personality.
export async function updateProfile({ deviceId, familyId, patch, actorId = null }) {
  const clean = validateProfile(patch, { partial: true });
  return mapVoiceError(withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, familyId);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    // Toys claimed before profiles existed have no row yet.
    const updated = await profiles.update(tx, row.id, clean) ?? await profiles.upsert(tx, row.id, { ...DEFAULT_PROFILE, ...clean });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'profile_updated', actorKind: 'parent', actorId, detail: { fields: Object.keys(clean) } });
    return updated && devices.findInFamily(tx, row.id, familyId);
  }));
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
// The blocked hook fires only after COMMIT: it closes sockets and abandons
// turns, which must not happen for a transaction that then rolls back.
export async function disable({ deviceId, familyId = null, by, reason = null, actorId = null }) {
  const updated = await withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, familyId);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    if (row.status !== STATUS.ACTIVE) throw conflict('device_not_active', 'device is not active');
    assertTransition(row.status, STATUS.DISABLED);
    const next = await devices.setStatus(tx, row.id, { status: STATUS.DISABLED, statusReason: reason, disabledBy: by });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'disabled', actorKind: by, actorId });
    return next;
  });
  onDeviceBlocked(updated.id, STATUS.DISABLED);
  return updated;
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
  const updated = await withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, familyId);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is revoked');
    assertTransition(row.status, STATUS.PROVISIONED);
    const next = await devices.unpair(tx, row.id);
    await devices.insertEvent(tx, {
      deviceId: row.id,
      event: 'unpaired',
      actorKind: 'parent',
      actorId,
      detail: { family_id: familyId },
    });
    return next;
  });
  onDeviceBlocked(updated.id, STATUS.PROVISIONED);
  // What the toy learned about this family (when no child was assigned) is
  // theirs, not the next owner's. Best-effort: the unpair has committed and
  // must not fail because the brain is down, so a miss is only logged.
  pipeline.wipeDeviceSubject({ deviceId: updated.id, familyId }).catch((err) =>
    log.warn('brain_wipe_failed', { device_id: updated.id, code: err.code ?? 'error' }),
  );
  return updated;
}

export async function revoke({ deviceId, reason, actorId = null }) {
  if (!REVOKE_REASONS.includes(reason)) {
    throw badRequest('validation_error', `reason must be one of ${REVOKE_REASONS.join(', ')}`);
  }
  const updated = await withTransaction(async (tx) => {
    const row = await lockDevice(tx, deviceId, null);
    if (row.status === STATUS.REVOKED) throw conflict('device_revoked', 'device is already revoked');
    assertTransition(row.status, STATUS.REVOKED);
    const next = await devices.setStatus(tx, row.id, { status: STATUS.REVOKED, statusReason: reason });
    await devices.insertEvent(tx, { deviceId: row.id, event: 'revoked', actorKind: 'admin', actorId, detail: { reason } });
    return next;
  });
  onDeviceBlocked(updated.id, STATUS.REVOKED);
  return updated;
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

// The web toy: the owning family's browser plays the toy, signing /v1 so a
// demo turn goes through the same gate and credits. It gets a credential
// derived for this ownership (secret_box.webToySecret), not the factory
// secret: a former owner who kept it cannot sign as the toy once it is
// unpaired or claimed again. Only an active toy of the caller's family;
// everything else is the same 404, so the endpoint cannot probe which ids
// exist. The reveal is stamped on the device (it is also what switches the
// web credential on in getForAuth) and in its events.
export async function revealSecret({ deviceId, familyId, actorId = null }) {
  return withTransaction(async (tx) => {
    const row = await devices.findInFamilyForUpdate(tx, deviceId, familyId);
    if (!row || row.status !== STATUS.ACTIVE) throw notFound('device_not_found', 'device not found');
    const secret = webToySecret(unwrapSecret(row.id, row.secret_enc), { familyId: row.family_id, claimedAt: row.claimed_at });
    await devices.markSecretRevealed(tx, row.id);
    await devices.insertEvent(tx, { deviceId: row.id, event: 'secret_revealed', actorKind: 'parent', actorId });
    return { device_id: row.id, secret_hex: secret.toString('hex') };
  });
}

// A web credential is honoured only while the family it was derived for
// still owns the toy (active, or paused so the page can show why it is
// quiet) and only after a reveal; unpair clears both.
function webSecretFor(row, secret) {
  if (!row.secret_revealed_at || !row.family_id || !row.claimed_at) return null;
  if (row.status !== STATUS.ACTIVE && row.status !== STATUS.DISABLED) return null;
  return webToySecret(secret, { familyId: row.family_id, claimedAt: row.claimed_at });
}

// devices/hmac_auth.js calls this to verify a signature; revealSecret above
// is the only other path that decrypts.
export async function getForAuth(deviceId) {
  const row = await devices.findById(pool, deviceId);
  if (!row) return null;
  const secret = unwrapSecret(row.id, row.secret_enc);
  const prevValid = row.secret_prev_enc && row.secret_prev_expires_at && row.secret_prev_expires_at.getTime() > Date.now();
  const prevSecret = prevValid ? unwrapSecret(row.id, row.secret_prev_enc) : null;
  return { device: toPublic(row), secret, prevSecret, webSecret: webSecretFor(row, secret) };
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
