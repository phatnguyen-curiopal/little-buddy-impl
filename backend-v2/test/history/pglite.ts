// The same in-process PostgreSQL as test/helpers/db.ts, plus a copy
// operation: a year takes seconds to replay, so tests that change data work
// on a copy of it instead of replaying again. PGlite's own clone() drops the
// parser options, so a copy is a dump loaded with the same ones.

import { PGlite, types } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

import { seedCast } from '../../src/character/packs.ts';
import type { Db, Queryable } from '../../src/db/index.ts';
import { migrate } from '../../src/db/migrate.ts';

export interface CopyableDb extends Db {
  copy(): Promise<CopyableDb>;
}

const OPTIONS = { extensions: { vector }, parsers: { [types.DATE]: (v: string) => v } };

function wrap(c: PGlite | Parameters<Parameters<PGlite['transaction']>[0]>[0]): Queryable {
  return {
    async query(text, params) {
      const r = await c.query<any>(text, (params ?? []) as unknown[]);
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async exec(sql) {
      await c.exec(sql);
    },
  };
}

function toDb(pg: PGlite): CopyableDb {
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
    async copy() {
      const dump = await pg.dumpDataDir('none');
      const next = new PGlite({ ...OPTIONS, loadDataDir: dump });
      await next.waitReady;
      return toDb(next);
    },
  };
}

export async function createCopyableDb(): Promise<CopyableDb> {
  const pg = new PGlite(OPTIONS);
  await pg.waitReady;
  const db = toDb(pg);
  await migrate(db);
  await seedCast(db);
  return db;
}
