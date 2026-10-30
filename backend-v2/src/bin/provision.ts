// Provisions a batch of toys and writes the factory manifest, the only place
// a device secret exists in plain text, to manifests/ (gitignored, mode 600).

import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { configFromProcess } from '../config.ts';
import { createPgDb } from '../db/index.ts';
import { provisionDevices } from '../devices/credentials.ts';

const { values } = parseArgs({
  options: { count: { type: 'string', default: '1' }, 'hardware-rev': { type: 'string', default: 'proto-1' }, label: { type: 'string', default: 'dev' } },
});
const count = Number(values.count);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('--count must be 1 to 1000');

const config = configFromProcess();
const db = createPgDb(config.databaseUrl, { max: 1 });
try {
  const entries = await provisionDevices(db, config.deviceKek, { count, hardwareRev: values['hardware-rev'] });
  const dir = fileURLToPath(new URL('../../manifests/', import.meta.url));
  await mkdir(dir, { recursive: true });
  const file = `${dir}${values.label}-${Date.now()}.json`;
  await writeFile(file, JSON.stringify({ hardware_rev: values['hardware-rev'], devices: entries }, null, 2), { mode: 0o600 });
  process.stdout.write(`provisioned ${entries.length} toy(s); manifest written to ${file}\n`);
} finally {
  await db.close();
}
