import pg from 'pg';
import config from '../../config.js';
import { pool } from '../../store/db.js';
import { runMigrations } from '../../store/migrate.js';
import redis, { connect as connectRedis, close as closeRedis } from '../../store/redis.js';

const DOCKER_HINT =
  'Postgres or Redis is not reachable. Start the dev services first, from the repo root: docker compose up -d';

// Tests TRUNCATE every table, so they must never point at the dev database.
function assertTestTargets() {
  const dbName = new URL(config.databaseUrl).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`refusing to run tests against database "${dbName}": name must end with _test`);
  }
  const redisDb = new URL(config.redisUrl).pathname.slice(1);
  if (redisDb === '' || redisDb === '0') {
    throw new Error('refusing to run tests against Redis db 0: use a separate db index');
  }
  return dbName;
}

function isConnectionRefused(err) {
  return err?.code === 'ECONNREFUSED' || err?.name === 'AggregateError';
}

// Volumes created before docker/postgres-init existed have no test database.
export async function ensureTestDatabase() {
  const dbName = assertTestTargets();
  const adminUrl = new URL(config.databaseUrl);
  adminUrl.pathname = '/postgres';
  const client = new pg.Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
  } catch (err) {
    throw isConnectionRefused(err) ? new Error(DOCKER_HINT) : err;
  }
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
}

export async function migrate() {
  return runMigrations(pool);
}

// Reference data seeded by migrations; truncating it would leave later tests
// with nothing to buy.
const KEEP = ['schema_migrations', 'credit_packs', 'personalities'];

// The table list is queried, so new tables need no edit here.
export async function resetDb() {
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT (tablename = ANY($1))`,
    [KEEP],
  );
  if (tables.rowCount === 0) return;
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export async function resetRedis() {
  try {
    await connectRedis();
  } catch (err) {
    throw isConnectionRefused(err) ? new Error(DOCKER_HINT) : err;
  }
  await redis.flushdb();
}

export async function setupDb() {
  await ensureTestDatabase();
  await migrate();
  await resetDb();
  await resetRedis();
}

export async function teardownDb() {
  await closeRedis().catch(() => {});
  await pool.end();
}
