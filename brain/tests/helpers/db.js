import { createPool } from '../../store/db.js';
import { ensureDatabase, runMigrations } from '../../store/migrate.js';

// Tests TRUNCATE every table, so they must never point at a real database.
export function assertTestDatabase(url = process.env.DATABASE_URL) {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith('_test')) throw new Error(`refusing to run tests against database "${name}": name must end with _test`);
  return name;
}

let pool = null;

export async function setupDb() {
  assertTestDatabase();
  await ensureDatabase(process.env.DATABASE_URL);
  pool = createPool(process.env.DATABASE_URL, { max: 6 });
  await runMigrations(pool);
  await resetDb();
  return pool;
}

export async function resetDb() {
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
  );
  if (rows.length) await pool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY`);
}

export async function teardownDb() {
  if (pool) await pool.end();
  pool = null;
}
