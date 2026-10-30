// An in-process PostgreSQL (PGlite, real Postgres compiled to WebAssembly)
// with pgvector, migrated with the production migrations. No Docker needed.

import { PGlite, types } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

import { seedCast } from '../../src/character/packs.ts';
import { loadConfig, type Config } from '../../src/config.ts';
import type { Db, Queryable } from '../../src/db/index.ts';
import { migrate } from '../../src/db/migrate.ts';

interface PgLike {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; affectedRows?: number; command?: string }>;
  exec(sql: string): Promise<unknown>;
}

function wrap(c: PgLike): Queryable {
  return {
    async query(text, params) {
      const r = await c.query(text, (params ?? []) as unknown[]);
      const rowCount = r.rows.length || r.affectedRows || 0;
      return { rows: r.rows, rowCount };
    },
    async exec(sql) {
      await c.exec(sql);
    },
  };
}

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<Db> {
  const pg = new PGlite({ extensions: { vector }, parsers: { [types.DATE]: (v: string) => v } });
  const base = wrap(pg as unknown as PgLike);
  const db: Db = {
    ...base,
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx as unknown as PgLike))),
    close: () => pg.close(),
  };
  await migrate(db);
  if (opts.seed !== false) await seedCast(db);
  return db;
}

export function testConfig(extra: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    GATEWAY: 'fake',
    ALLOW_TEXT_TURNS: '1',
    EMAIL_DEV_ECHO: '1',
    // PGlite is slower than a real server; a generous budget keeps tests deterministic.
    RECALL_BUDGET_MS: '5000',
    ...extra,
  });
}
