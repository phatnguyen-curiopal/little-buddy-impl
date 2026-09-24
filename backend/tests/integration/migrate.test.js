import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ensureTestDatabase, migrate, teardownDb } from '../helpers/db.js';
import { pool } from '../../store/db.js';

before(async () => {
  await ensureTestDatabase();
});

after(async () => {
  await teardownDb();
});

test('running migrations twice applies nothing the second time', async () => {
  await migrate();
  const second = await migrate();
  assert.deepEqual(second, []);
});

test('schema_migrations records the initial file', async () => {
  const r = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  assert.deepEqual(r.rows.map((x) => x.filename), ['001_init.sql', '002_drop_child_family_check.sql', '003_credits_turns.sql', '004_credit_purchases.sql']);
});

test('the vector extension and every table exist', async () => {
  const ext = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
  assert.equal(ext.rowCount, 1);
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  assert.deepEqual(
    tables.rows.map((x) => x.tablename),
    ['children', 'conversations', 'credit_ledger', 'credit_packs', 'device_batches', 'device_events', 'devices', 'families', 'parents', 'purchases', 'refresh_tokens', 'schema_migrations', 'turns'],
  );
});

test('a broken migration rolls back and names the file', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { runMigrations } = await import('../../store/migrate.js');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lb-mig-'));
  await writeFile(path.join(dir, '900_bad.sql'), 'CREATE TABLE tmp_should_roll_back (id int); SELECT 1/0;');
  await assert.rejects(() => runMigrations(pool, dir), /migration 900_bad\.sql failed/);
  const leaked = await pool.query(`SELECT 1 FROM pg_tables WHERE tablename = 'tmp_should_roll_back'`);
  assert.equal(leaked.rowCount, 0);
  const recorded = await pool.query(`SELECT 1 FROM schema_migrations WHERE filename = '900_bad.sql'`);
  assert.equal(recorded.rowCount, 0);
});
