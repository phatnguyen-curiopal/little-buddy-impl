// Toy credentials: a 32-byte secret per toy, written at the factory, sealed
// at rest. The toy signs every connection challenge and every claim token
// with it, so the cloud never sends the secret anywhere. The one exception is
// a Buddy that lives only in the browser: it has no physical toy to protect,
// so its owner's browser receives the secret to sign in with.

import { randomBytes, randomInt, randomUUID } from 'node:crypto';

import type { Db, Queryable } from '../db/index.ts';
import { b64url, deriveKey, hmacB64url, open, safeEqual, seal } from '../util/crypto.ts';

const aad = (deviceId: string) => `device:${deviceId}`;
const keyFor = (kek: string) => deriveKey(kek, 'little-buddy device secret v1');

// The code printed on the box: 8 characters without look-alikes (no I, L,
// O, U, 0 or 1), shown as XXXX-XXXX. Only a keyed hash is stored.
export const CLAIM_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function normalizeClaimCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === 8 && [...code].every((c) => CLAIM_ALPHABET.includes(c)) ? code : null;
}

export function claimCodeHash(kek: string, code: string): string {
  return hmacB64url(deriveKey(kek, 'little-buddy claim code v1'), code);
}

function newClaimCode(): string {
  return Array.from({ length: 8 }, () => CLAIM_ALPHABET[randomInt(0, CLAIM_ALPHABET.length)]).join('');
}

export interface ManifestEntry {
  device_id: string;
  serial: string;
  secret: string;
  claim_code: string;
}

export async function provisionDevices(db: Db, kek: string, opts: { count: number; hardwareRev: string; prefix?: string }): Promise<ManifestEntry[]> {
  const key = keyFor(kek);
  const year = String(new Date().getUTCFullYear()).slice(2);
  return db.tx(async (q) => {
    const out: ManifestEntry[] = [];
    for (let i = 0; i < opts.count; i += 1) {
      const id = randomUUID();
      const secret = randomBytes(32);
      let serial = '';
      for (let attempt = 0; attempt < 5 && !serial; attempt += 1) {
        const candidate = `${opts.prefix ?? 'LB1'}-${year}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
        const taken = await q.query('SELECT 1 FROM device WHERE serial = $1', [candidate]);
        if (!taken.rowCount) serial = candidate;
      }
      if (!serial) throw new Error('could not find a free serial');
      const claimCode = newClaimCode();
      await q.query('INSERT INTO device (id, serial, hardware_rev, claim_code_hash) VALUES ($1, $2, $3, $4)', [id, serial, opts.hardwareRev, claimCodeHash(kek, claimCode)]);
      await q.query('INSERT INTO device_credential (device_id, secret_sealed, key_version) VALUES ($1, $2, 1)', [id, seal(key, secret, aad(id))]);
      await q.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'provisioned', 'system')", [id]);
      out.push({ device_id: id, serial, secret: b64url(secret), claim_code: claimCode });
    }
    return out;
  });
}

// A Buddy with no card: provisioned and claimed for a child in the caller's
// transaction, so it never exists unowned.
export async function createWebDevice(q: Queryable, kek: string, owner: { familyId: string; childId: string; actor: string }): Promise<string> {
  const id = randomUUID();
  const secret = randomBytes(32);
  const month = new Date().toISOString().slice(2, 7).replace('-', '');
  let serial = '';
  for (let attempt = 0; attempt < 5 && !serial; attempt += 1) {
    const candidate = `WEB-${month}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
    const taken = await q.query('SELECT 1 FROM device WHERE serial = $1', [candidate]);
    if (!taken.rowCount) serial = candidate;
  }
  if (!serial) throw new Error('could not find a free serial');
  await q.query(
    "INSERT INTO device (id, serial, hardware_rev, status, family_id, child_id, claimed_at) VALUES ($1, $2, 'web', 'active', $3, $4, now())",
    [id, serial, owner.familyId, owner.childId],
  );
  await q.query('INSERT INTO device_credential (device_id, secret_sealed, key_version) VALUES ($1, $2, 1)', [id, seal(keyFor(kek), secret, aad(id))]);
  await q.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'provisioned', $2), ($1, 'claimed', $2)", [id, owner.actor]);
  return id;
}

export async function loadDeviceSecret(q: Queryable, kek: string, deviceId: string): Promise<Buffer | null> {
  const r = await q.query<{ secret_sealed: Buffer }>('SELECT secret_sealed FROM device_credential WHERE device_id = $1', [deviceId]);
  const sealed = r.rows[0]?.secret_sealed;
  if (!sealed) return null;
  try {
    return open(keyFor(kek), Buffer.from(sealed), aad(deviceId));
  } catch {
    return null;
  }
}

// The server's own clock is signed, so a toy with a wrong clock still signs in.
export function signChallenge(secret: Buffer, nonce: string, deviceId: string, serverTime: number): string {
  return hmacB64url(secret, `${nonce}.${deviceId}.${serverTime}`);
}

export function verifyChallenge(secret: Buffer, nonce: string, deviceId: string, serverTime: number, signature: string): boolean {
  return safeEqual(signChallenge(secret, nonce, deviceId, serverTime), signature);
}

// Claim token: dct.<device id>.<issued at, unix seconds>.<signature>
export function makeClaimToken(secret: Buffer, deviceId: string, issuedAt: number): string {
  return `dct.${deviceId}.${issuedAt}.${hmacB64url(secret, `claim.${deviceId}.${issuedAt}`)}`;
}

export function parseClaimToken(token: string): { deviceId: string; issuedAt: number; signature: string } | null {
  const m = /^dct\.([0-9a-f-]{36})\.(\d{9,11})\.([A-Za-z0-9_-]{20,})$/.exec(token.trim());
  return m ? { deviceId: m[1], issuedAt: Number(m[2]), signature: m[3] } : null;
}

export function verifyClaimToken(secret: Buffer, parsed: { deviceId: string; issuedAt: number; signature: string }, nowSec: number, maxAgeSec = 600): boolean {
  if (parsed.issuedAt > nowSec + 60 || nowSec - parsed.issuedAt > maxAgeSec) return false;
  return safeEqual(hmacB64url(secret, `claim.${parsed.deviceId}.${parsed.issuedAt}`), parsed.signature);
}
