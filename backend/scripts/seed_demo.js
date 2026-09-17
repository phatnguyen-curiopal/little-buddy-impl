// A demo family with one claimed toy and one unclaimed toy, so the running
// server can be poked at by hand. Rerunnable: it replaces the previous demo.
import { writeFile } from 'node:fs/promises';
import config from '../config.js';
import { pool } from '../store/db.js';
import * as auth from '../auth/service.js';
import * as parents from '../store/parent.js';
import * as childrenStore from '../store/child.js';
import * as registry from '../devices/registry.js';

const EMAIL = 'demo@littlebuddy.local';
const PASSWORD = 'demo-password';
const BATCH = 'DEMO';

if (config.isProd) {
  console.error('seed_demo does not run in production');
  process.exit(2);
}

try {
  // Devices first, then the family, so nothing depends on cascade ordering.
  await pool.query('DELETE FROM devices WHERE batch_id IN (SELECT id FROM device_batches WHERE label = $1)', [BATCH]);
  await pool.query('DELETE FROM device_batches WHERE label = $1', [BATCH]);
  const existing = await parents.findByEmail(pool, EMAIL);
  if (existing) await pool.query('DELETE FROM families WHERE id = $1', [existing.family_id]);

  const reg = await auth.register({ email: EMAIL, password: PASSWORD, familyName: 'Gia đình Demo', displayName: 'Phụ huynh Demo' });
  const child = await childrenStore.insert(pool, { familyId: reg.family.id, name: 'Bông', birthYear: 2020 });
  const { devices } = await registry.provisionBatch({ label: BATCH, hardwareRev: 'r1', count: 2, notes: 'seed_demo', actorId: 'seed' });
  const [claimed, spare] = devices;
  await registry.claimByCode({ familyId: reg.family.id, claimCode: claimed.claim_code, childId: child.id, actorId: reg.parent.id });

  // For the sim device and curl; gitignored by the .env.* rule.
  await writeFile('.env.device', `DEV_DEVICE_ID=${claimed.device_id}\nDEV_DEVICE_SECRET=${claimed.secret_hex}\n`, { mode: 0o600 });

  console.log(`
Demo family seeded.

  Parent login      ${EMAIL} / ${PASSWORD}
  Family id         ${reg.family.id}
  Child             ${child.name} (${child.id})

  Claimed toy       serial ${claimed.serial}
    device_id       ${claimed.device_id}
    secret_hex      ${claimed.secret_hex}
    (also written to backend/.env.device)

  Unclaimed toy     serial ${spare.serial}
    claim code      ${spare.claim_code}
    device_id       ${spare.device_id}
    secret_hex      ${spare.secret_hex}
`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
