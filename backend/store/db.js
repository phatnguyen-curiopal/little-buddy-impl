import pg from 'pg';
import config from '../config.js';
import log from '../lib/log.js';

// One pool per process. Repository functions take the queryable as their
// first argument (this pool or a transaction client), so whether a call is
// inside a transaction is visible at the call site instead of hidden.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 3000,
});

pool.on('error', (err) => log.error('pg_pool_error', { err_message: err.message }));

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function ping() {
  await pool.query('SELECT 1');
}

export function close() {
  return pool.end();
}
