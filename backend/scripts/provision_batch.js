// Factory provisioning. Writes a manifest (device_id, serial, secret,
// claim code) for the flashing bench and the label printer. The manifest is
// the only copy of the secrets in the clear: it is written with mode 0600,
// fsynced inside the database transaction, never overwritten, and never
// echoed to stdout or the logger.
//
//   npm run provision -- --label 2026W38A --count 50 --hardware-rev r1 [--out manifests/2026W38A.csv] [--format csv|json] [--notes "..."]
//   npm run provision -- --rotate <device_id> [--out manifests/rotate-<id>.csv]
//
// Exit codes: 0 ok, 1 error, 2 batch already exists or refused.
import { parseArgs } from 'node:util';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import config from '../config.js';
import { pool } from '../store/db.js';
import * as registry from '../devices/registry.js';

const COLUMNS = ['device_id', 'serial', 'secret_hex', 'claim_code', 'hardware_rev', 'batch_label'];

const { values: args } = parseArgs({
  options: {
    label: { type: 'string' },
    count: { type: 'string' },
    'hardware-rev': { type: 'string' },
    notes: { type: 'string' },
    out: { type: 'string' },
    format: { type: 'string', default: 'csv' },
    rotate: { type: 'string' },
    yes: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

function usage(code) {
  console.error('usage: provision_batch --label LABEL --count N --hardware-rev REV [--out FILE] [--format csv|json] [--notes TEXT]');
  console.error('       provision_batch --rotate DEVICE_ID [--out FILE]');
  process.exit(code);
}

if (args.help) usage(0);
if (!['csv', 'json'].includes(args.format)) usage(2);
if (config.isProd && !args.yes) {
  console.error('refusing to provision in production without --yes');
  process.exit(2);
}

function render(rows) {
  if (args.format === 'json') return JSON.stringify(rows, null, 2) + '\n';
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => r[c] ?? '').join(','))].join('\n') + '\n';
}

// 'wx' refuses to overwrite: a manifest that already exists is evidence, not
// scratch space. fsync before returning so a commit never outruns the file.
async function writeManifest(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const fh = await open(filePath, 'wx', 0o600);
  try {
    await fh.writeFile(content);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

let exitCode = 0;
try {
  if (args.rotate) {
    const outPath = args.out ?? path.join('manifests', `rotate-${args.rotate.slice(0, 8)}-${Date.now()}.${args.format}`);
    const r = await registry.rotateSecret({ deviceId: args.rotate, actorId: 'cli' });
    await writeManifest(outPath, render([{ device_id: r.device_id, serial: r.serial, secret_hex: r.secret_hex }]));
    console.log(JSON.stringify({ rotated: r.device_id, serial: r.serial, manifest_path: outPath }));
    console.error('Reflash the device from the manifest within 7 days; the previous secret stops working after that.');
  } else {
    const label = args.label;
    const count = Number(args.count);
    const hardwareRev = args['hardware-rev'];
    if (!label || !hardwareRev || !Number.isInteger(count)) usage(2);
    const outPath = args.out ?? path.join('manifests', `${label}.${args.format}`);
    const { batch } = await registry.provisionBatch({
      label,
      hardwareRev,
      count,
      notes: args.notes ?? null,
      actorId: 'cli',
      beforeCommit: (manifest) => writeManifest(outPath, render(manifest)),
    });
    console.log(JSON.stringify({ batch_label: batch.label, batch_id: batch.id, count, manifest_path: outPath }));
  }
} catch (err) {
  console.error(err.message);
  if (err.code === 'EEXIST') console.error('the manifest file already exists; pick another --out or move it away');
  exitCode = err.code === 'batch_exists' ? 2 : 1;
} finally {
  await pool.end();
}
process.exitCode = exitCode;
