// Forward-only SQL migrations. The embedding column type is decided here,
// once, from the installed pgvector: halfvec needs 0.7+, and the demo server
// still runs 0.6.0 (tested 30 October 2026).

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Db } from './index.ts';
import type { Logger } from '../log.ts';

export type VecType = 'halfvec' | 'vector';

export function versionAtLeast(version: string, min: string): boolean {
  const a = version.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

const DEFAULT_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function migrate(db: Db, opts: { dir?: string; log?: Logger } = {}): Promise<{ applied: string[]; vecType: VecType }> {
  const dir = opts.dir ?? DEFAULT_DIR;
  await db.exec('CREATE EXTENSION IF NOT EXISTS vector');
  const ext = await db.query<{ extversion: string }>("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  const vecType: VecType = versionAtLeast(ext.rows[0]?.extversion ?? '0', '0.7.0') ? 'halfvec' : 'vector';

  await db.exec('CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migration')).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = (await readFile(join(dir, file), 'utf8')).replaceAll('{{vec}}', vecType);
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
    });
    applied.push(file);
    opts.log?.info('migration applied', { file, vecType });
  }
  return { applied, vecType };
}
