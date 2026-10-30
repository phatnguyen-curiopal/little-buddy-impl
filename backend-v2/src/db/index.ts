// One small interface over node-postgres in production and PGlite in tests,
// so every query runs against real PostgreSQL semantics in both.

import pg from 'pg';

export interface QueryResult<R> {
  rows: R[];
  rowCount: number;
}

export interface Queryable {
  query<R = Record<string, any>>(text: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
  // Multi-statement scripts (migrations); no parameters.
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Counters and identity columns stay far below 2^53, and PGlite already
// returns numbers, so both drivers hand back the same JS types.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
// A DATE is a calendar day in the child's time zone; turning it into a JS Date
// at local midnight would shift it across time zones.
pg.types.setTypeParser(1082, (v) => v);

function wrap(client: pg.Pool | pg.PoolClient): Queryable {
  return {
    async query(text, params) {
      const r = await client.query(text, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async exec(sql) {
      await client.query(sql);
    },
  };
}

export function createPgDb(connectionString: string, opts: { max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10 });
  const base = wrap(pool);
  return {
    ...base,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
