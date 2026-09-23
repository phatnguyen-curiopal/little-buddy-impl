import config from '../config.js';
import { pool } from '../store/db.js';
import * as families from '../store/family.js';
import * as ledger from '../store/ledger.js';
import { badRequest, notFound } from '../lib/http_error.js';

// Credits belong to the family and the ledger is append-only: every change
// is a new row and the balance is the sum. Debits are written by
// turns/service.js at turn close; this module owns everything else.
//
// A future negative kind that is not tied to a turn (expiry) must take the
// family lock (families.lockForUpdate) before inserting, or it could dip
// the balance under the credits already reserved by turns in flight.

const MAX_GRANT = 10000;
const GRANT_KINDS = ['grant', 'refund'];

export async function grant({ familyId, amount, kind = 'grant', reason, actorId = null }) {
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    throw badRequest('validation_error', `amount must be an integer between 1 and ${MAX_GRANT}`);
  }
  if (!GRANT_KINDS.includes(kind)) throw badRequest('validation_error', `kind must be one of ${GRANT_KINDS.join(', ')}`);
  if (typeof reason !== 'string' || !reason.trim()) throw badRequest('validation_error', 'reason is required');
  const family = await families.findById(pool, familyId);
  if (!family) throw notFound('family_not_found', 'family not found');
  await ledger.insert(pool, { familyId, kind, delta: amount, reason: reason.trim(), actorKind: 'admin', actorId });
  return { balance: await ledger.balance(pool, familyId) };
}

export async function wallet(familyId, { limit = 50 } = {}) {
  const [balance, rows] = await Promise.all([ledger.balance(pool, familyId), ledger.listByFamily(pool, familyId, limit)]);
  return { balance, ledger: rows.map(ledger.toDto) };
}

// Called inside the registration transaction so a family never exists
// without its welcome credits. Zero means no row: the sign check rejects 0.
export async function welcomeGrant(tx, familyId) {
  if (config.welcomeCredits === 0) return null;
  return ledger.insert(tx, {
    familyId,
    kind: 'grant',
    delta: config.welcomeCredits,
    reason: 'welcome',
    actorKind: 'system',
  });
}

export function balance(familyId) {
  return ledger.balance(pool, familyId);
}
