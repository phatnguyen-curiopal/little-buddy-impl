import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const FILE_RE = /^\d{3}_.+\.sql$/;
// Any constant, as long as every process running migrations agrees on it.
const LOCK_KEY = 828282;

function dbNameOf(databaseUrl) {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

// The brain databases live in the same pgvector container as the backend's.
// A volume created before docker/postgres-init knew about them has neither
// the database nor the extension, so both are created here when missing.
export async function ensureDatabase(databaseUrl) {
  const name = dbNameOf(databaseUrl);
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`refusing unusual database name "${name}"`);
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 3000 });
  await admin.connect();
  try {
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const target = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
  await target.connect();
  try {
    await target.query('CREATE EXTENSION IF NOT EXISTS vector');
  } finally {
    await target.end();
  }
}

// Forward-only: each file runs once, in its own transaction, under an
// advisory lock so two processes starting together cannot both apply it.
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
      const seen = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (seen.rowCount === 0) {
        const sql = await readFile(path.join(dir, file), 'utf8');
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
