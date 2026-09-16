import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const FILE_RE = /^\d{3}_.+\.sql$/;
// Any constant; it only has to be the same in every process running migrations.
const LOCK_KEY = 727272;

// Forward-only runner: each file runs once, inside its own transaction, under
// an advisory lock so two processes starting together cannot both apply it.
export async function runMigrations(pool, dir = MIGRATIONS_DIR) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(dir)).filter((f) => FILE_RE.test(f)).sort();
  const applied = [];

  for (const file of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
      // Re-check under the lock: another process may have applied it since
      // we listed the directory.
      const seen = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (seen.rowCount === 0) {
        const sql = await readFile(path.join(dir, file), 'utf8');
        // No parameters, so pg uses the simple protocol and multi-statement
        // files work in one call.
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        applied.push(file);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`migration ${file} failed: ${err.message}`, { cause: err });
    } finally {
      client.release();
    }
  }
  return applied;
}
