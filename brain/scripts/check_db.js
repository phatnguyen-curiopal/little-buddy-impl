import pg from 'pg';

// Runs as `pretest`: without it every test file would fail with its own
// ECONNREFUSED stack trace. The test database itself is created by the
// helpers, so only the server has to be reachable here.
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
try {
  await client.connect();
  await client.query('SELECT 1');
} catch (err) {
  console.error(`Postgres is not reachable at ${url.hostname}:${url.port} (${err.code || err.message}).`);
  console.error('Start the dev services first, from the repo root:  docker compose up -d');
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
