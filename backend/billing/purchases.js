import { randomBytes } from 'node:crypto';
import config from '../config.js';
import { pool, withTransaction } from '../store/db.js';
import * as purchases from '../store/purchase.js';
import * as ledger from '../store/ledger.js';
import { HttpError, conflict, notFound } from '../lib/http_error.js';

// Buying credits, demo stage. The flow has the two steps a real payment
// provider will have: the parent creates a pending purchase, then the
// provider confirms it. payDemo stands in for that confirmation (a webhook
// later); it is the only way a purchase becomes paid, and marking it paid
// and adding the credits happen in one transaction, at most once.
//
// config.js refuses PAYMENT_PROVIDER=demo in production: it gives credits
// away for nothing.

function assertEnabled() {
  if (config.paymentProvider !== 'demo') {
    throw new HttpError(403, 'payments_disabled', 'buying credits is not available');
  }
}

export async function listPacks() {
  return (await purchases.listPacks(pool)).map(purchases.packDto);
}

// An idempotency key lets the dashboard retry a create after a network blip
// without opening a second checkout.
export async function createPurchase({ familyId, parentId, packId, idempotencyKey = null }) {
  assertEnabled();
  if (idempotencyKey) {
    const existing = await purchases.findByIdempotencyKey(pool, familyId, idempotencyKey);
    if (existing) {
      if (existing.pack_id !== packId) throw conflict('idempotency_key_reused', 'this idempotency key was used for another pack');
      return { purchase: purchases.toDto(existing), created: false };
    }
  }
  const pack = await purchases.findPack(pool, packId);
  if (!pack || !pack.active) throw notFound('pack_not_found', 'credit pack not found');
  try {
    const row = await purchases.insert(pool, { familyId, parentId, pack, provider: 'demo', idempotencyKey });
    return { purchase: purchases.toDto(row), created: true };
  } catch (err) {
    // Two identical creates racing: the loser returns the winner's row.
    if (err.code === '23505' && idempotencyKey) {
      const again = await purchases.findByIdempotencyKey(pool, familyId, idempotencyKey);
      if (again) return { purchase: purchases.toDto(again), created: false };
    }
    throw err;
  }
}

export async function payDemo({ familyId, purchaseId, outcome }) {
  assertEnabled();
  const current = await purchases.findInFamily(pool, purchaseId, familyId);
  if (!current) throw notFound('purchase_not_found', 'purchase not found');

  if (outcome === 'decline') {
    const row = await purchases.markFailed(pool, purchaseId, 'card_declined');
    if (!row) throw conflict('purchase_not_pending', 'this purchase is already settled');
    return { purchase: purchases.toDto(row), balance: await ledger.balance(pool, familyId) };
  }

  return withTransaction(async (tx) => {
    const row = await purchases.markPaid(tx, purchaseId, `demo_${randomBytes(8).toString('hex')}`);
    if (!row) throw conflict('purchase_not_pending', 'this purchase is already settled');
    await ledger.insertPurchase(tx, {
      familyId,
      purchaseId,
      credits: row.credits,
      reason: `pack:${row.pack_id}`,
      actorId: row.parent_id,
    });
    return { purchase: purchases.toDto(row), balance: await ledger.balance(tx, familyId) };
  });
}

export async function listPurchases(familyId, limit = 50) {
  return (await purchases.listByFamily(pool, familyId, limit)).map(purchases.toDto);
}
