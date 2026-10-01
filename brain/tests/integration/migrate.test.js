import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { runMigrations } from '../../store/migrate.js';
import { assertTestDatabase, setupDb, teardownDb } from '../helpers/db.js';

let pool;
before(async () => {
  pool = await setupDb();
});
after(teardownDb);

test('the helpers refuse a database whose name does not end in _test', () => {
  assert.throws(() => assertTestDatabase('postgres://u:p@localhost:5432/littlebuddy_brain'), /must end with _test/);
  assert.equal(assertTestDatabase('postgres://u:p@localhost:5432/littlebuddy_brain_test'), 'littlebuddy_brain_test');
});

test('migrations are applied once and create every table with 3072-dim vectors', async () => {
  assert.deepEqual(await runMigrations(pool), []);
  const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  assert.deepEqual(rows.map((r) => r.tablename), [
    'backstories', 'child_facts', 'conversation_summaries', 'diary', 'exchanges', 'familiar_names', 'moods', 'schema_migrations',
  ]);
  const dims = await pool.query(
    `SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      WHERE a.attname = 'embedding' AND c.relkind = 'r' ORDER BY c.relname`,
  );
  assert.deepEqual(dims.rows.map((r) => `${r.relname}:${r.type}`), [
    'child_facts:vector(3072)', 'conversation_summaries:vector(3072)', 'exchanges:vector(3072)',
  ]);
});

test('check constraints hold the English codes', async () => {
  await assert.rejects(
    pool.query("INSERT INTO familiar_names (subject, name, display, kind) VALUES ('s', 'x', 'X', 'thú cưng')"),
    /check constraint/,
  );
  await assert.rejects(
    pool.query("INSERT INTO moods (device_id, day, score) VALUES (gen_random_uuid(), '2026-09-29', 101)"),
    /check constraint/,
  );
});
