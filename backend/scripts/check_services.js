import pg from 'pg';
import Redis from 'ioredis';
import config from '../config.js';

// Runs as `pretest`. Without it, node --test would spawn a worker per file and
// each would fail with its own ECONNREFUSED stack trace.
const CONNECT_TIMEOUT_MS = 2000;

function describe(url) {
  const u = new URL(url);
  return `${u.hostname}:${u.port}`;
}

async function checkPostgres() {
  const client = new pg.Client({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkRedis() {
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

const checks = [
  ['Postgres', config.databaseUrl, checkPostgres],
  ['Redis', config.redisUrl, checkRedis],
];

let failed = false;
for (const [name, url, check] of checks) {
  try {
    await check();
  } catch (err) {
    failed = true;
    // Postgres accepting the TCP connection but rejecting the database name is
    // a different fix than "start Docker", so it gets its own message.
    if (name === 'Postgres' && err.code === '3D000') {
      console.error(`${name} is running but the database in DATABASE_URL does not exist (${err.message}).`);
      continue;
    }
    console.error(`${name} is not reachable at ${describe(url)} (${err.code || err.message}).`);
  }
}

if (failed) {
  console.error('Start the dev services first, from the repo root:  docker compose up -d');
  process.exit(1);
}
