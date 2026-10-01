import pg from 'pg';

// The pool is built from config rather than at import time, so tests and
// scripts can point at their own database. Store modules take the queryable
// (this pool or a transaction client) as their first argument, which keeps
// transaction membership visible at the call site.
export function createPool(databaseUrl, { max = 8 } = {}) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max,
    connectionTimeoutMillis: 3000,
    // The embeddings round trip is the slow leg of a turn; a reconnect per
    // turn would add to it for nothing.
    idleTimeoutMillis: 300_000,
  });
  // An idle client error must not crash the process; the next query reports.
  pool.on('error', () => {});
  return pool;
}

export async function withTransaction(pool, fn) {
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

// pgvector's text input form.
export function vectorLiteral(vec) {
  return vec ? `[${vec.join(',')}]` : null;
}
