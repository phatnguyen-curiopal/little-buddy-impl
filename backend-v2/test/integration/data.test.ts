import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Db } from '../../src/db/index.ts';
import { migrate } from '../../src/db/migrate.ts';
import { seedCast } from '../../src/character/packs.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import { maintenance } from '../../src/jobs/handlers.ts';
import { buildWeeklyDigest, nightlySleep } from '../../src/jobs/nightly.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { createWorker } from '../../src/jobs/worker.ts';
import { silentLogger } from '../../src/log.ts';
import { buildDigest } from '../../src/memory/digest.ts';
import { forgetEverything } from '../../src/memory/forget.ts';
import { learnFromTurn } from '../../src/memory/learner.ts';
import { recall } from '../../src/memory/recall.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();
const gateway = createFakeGateway();

async function addTurn(db: Db, fam: Family, childText: string, replyText = 'Wowee!', sessionId?: string): Promise<{ turnId: string; sessionId: string }> {
  const day = new Date().toISOString().slice(0, 10);
  await db.query('SELECT ensure_turn_partition($1::date)', [day]);
  const sid = sessionId ?? (await db.query<{ id: string }>(
    "INSERT INTO chat_session (child_id, instance_id, started_at, ended_at, turns) VALUES ($1, $2, now() - interval '3 hours', now() - interval '2 hours', 1) RETURNING id",
    [fam.childId, fam.instanceId],
  )).rows[0].id;
  const t = await db.query<{ id: string }>(
    "INSERT INTO turn (session_id, child_id, child_text, reply_text, face, turn_type, language) VALUES ($1, $2, $3, $4, 'happy', 'answer', 'en') RETURNING id",
    [sid, fam.childId, childText, replyText],
  );
  return { turnId: t.rows[0].id, sessionId: sid };
}

describe('schema and migrations', () => {
  let db: Db;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it('creates every table, using halfvec on pgvector 0.7+', async () => {
    const tables = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migration'");
    // 41 domain tables plus 5 operational ones (refresh_token, email_login, idempotency_key, push_token, job).
    assert.equal(tables.rows[0].n, 46);
    const col = await db.query<{ t: string }>("SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute WHERE attrelid = 'fact'::regclass AND attname = 'embedding'");
    assert.equal(col.rows[0].t, 'halfvec(1536)');
  });

  it('is re-runnable, and the cast seed is idempotent', async () => {
    assert.deepEqual((await migrate(db)).applied, []);
    assert.equal(await seedCast(db), 0);
    const cast = await db.query<{ slug: string }>('SELECT slug FROM buddy_character ORDER BY slug');
    assert.deepEqual(cast.rows.map((r) => r.slug), ['bo', 'luna', 'pip']);
  });

  it('keeps turns to 30 days by dropping whole partitions', async () => {
    await db.query("SELECT ensure_turn_partition('2026-09-01'::date)");
    await db.query("SELECT ensure_turn_partition('2026-09-01'::date)");
    const dropped = await db.query<{ n: number }>("SELECT drop_turn_partitions_before('2026-09-02'::date) AS n");
    assert.equal(dropped.rows[0].n, 1);
    const left = await db.query("SELECT 1 FROM pg_class WHERE relname = 'turn_2026_09_01'");
    assert.equal(left.rowCount, 0);
  });

  it('removes everything about a child in one delete, and unpairs the toy', async () => {
    const fam = await createFamily(db, config);
    await addTurn(db, fam, 'hello');
    await db.query("INSERT INTO fact (child_id, category, statement, source, confidence) VALUES ($1, 'likes', 'loves mangoes', 'child', 0.9)", [fam.childId]);
    await db.query('DELETE FROM child WHERE id = $1', [fam.childId]);
    for (const table of ['turn', 'fact', 'chat_session', 'character_instance', 'child_controls']) {
      const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE child_id = $1`, [fam.childId]);
      assert.equal(r.rows[0].n, 0, table);
    }
    const toy = await db.query<{ child_id: string | null }>('SELECT child_id FROM device WHERE id = $1', [fam.device.device_id]);
    assert.equal(toy.rows[0].child_id, null);
  });
});

describe('job queue', () => {
  let db: Db;
  before(async () => {
    db = await createTestDb({ seed: false });
  });
  after(() => db.close());

  it('dedupes, claims, retries and finally gives up', async () => {
    const q = createJobQueue(db);
    assert.equal(await q.enqueue('maintenance', {}, { dedupeKey: 'm:1' }), true);
    assert.equal(await q.enqueue('maintenance', {}, { dedupeKey: 'm:1' }), false, 'duplicate while ready');
    const job = (await q.claim(['maintenance']))!;
    assert.equal(job.attempts, 1);
    assert.equal(await q.claim(['maintenance']), null, 'locked while running');
    for (let i = 1; i <= 5; i += 1) {
      const outcome = await q.fail({ ...job, attempts: i }, new Error('boom'));
      assert.equal(outcome, i >= 5 ? 'dead' : 'retry');
    }
    assert.equal(await q.enqueue('maintenance', {}, { dedupeKey: 'm:1' }), true, 'key frees once the job is dead');
  });
});

describe('memory', () => {
  let db: Db;
  let fam: Family;
  before(async () => {
    db = await createTestDb();
    fam = await createFamily(db, config);
  });
  after(() => db.close());

  it('learns people and facts, and merges repeats', async () => {
    const t1 = await addTurn(db, fam, 'My dog Mochi fell in a puddle and I love mangoes');
    const r1 = await learnFromTurn({ db, gateway, log: silentLogger }, t1.turnId);
    assert.ok(r1.written >= 2);
    const person = await db.query<{ display_name: string; kind: string }>('SELECT display_name, kind FROM person WHERE child_id = $1', [fam.childId]);
    assert.deepEqual(person.rows, [{ display_name: 'Mochi', kind: 'pet' }]);

    const t2 = await addTurn(db, fam, 'Guess what, I love mangoes', 'Wowee!', t1.sessionId);
    await learnFromTurn({ db, gateway, log: silentLogger }, t2.turnId);
    const facts = await db.query<{ statement: string; mentions: number }>("SELECT statement, mentions FROM fact WHERE child_id = $1 AND category = 'likes'", [fam.childId]);
    assert.equal(facts.rows.length, 1, 'the second mention merges into the first fact');
    assert.equal(facts.rows[0].mentions, 2);
    const evidence = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM fact_evidence');
    assert.equal(evidence.rows[0].n, 2);
  });

  it('writes nothing when learning is off', async () => {
    const off = await createFamily(db, config, { learning: false });
    const t = await addTurn(db, off, 'My cat Bun is fluffy');
    const r = await learnFromTurn({ db, gateway, log: silentLogger }, t.turnId);
    assert.equal(r.skipped, 'learning off');
    const n = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM person WHERE child_id = $1', [off.childId]);
    assert.equal(n.rows[0].n, 0);
  });

  it('recalls by meaning and by name within the budget', async () => {
    const r = await recall({ db, gateway }, { childId: fam.childId, instanceId: fam.instanceId, text: 'Do you remember Mochi? I love mangoes', budgetMs: 5000 });
    assert.equal(r.timedOut, false);
    assert.deepEqual(r.people.map((p) => p.display_name), ['Mochi']);
    assert.ok(r.memories.some((m) => m.text.includes('mangoes')));
  });

  it('builds the digest from the strongest facts', async () => {
    const d = (await buildDigest(db, fam.childId))!;
    assert.equal(d.name, 'Bông');
    assert.ok(d.likes.some((l) => l.includes('mangoes')));
    assert.deepEqual(d.people.map((p) => p.name), ['Mochi']);
  });

  it('runs nightly sleep: episode, diary, mood, stage', async () => {
    const queue = createJobQueue(db);
    const today = new Date().toISOString().slice(0, 10);
    await nightlySleep({ db, gateway, config, log: silentLogger, queue }, fam.childId, today);
    const ep = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM episode WHERE child_id = $1 AND embedding IS NOT NULL', [fam.childId]);
    assert.ok(ep.rows[0].n >= 1);
    const diary = await db.query<{ story: string }>("SELECT story FROM diary_entry WHERE instance_id = $1 AND day = $2::date + 1", [fam.instanceId, today]);
    assert.equal(diary.rows.length, 1);
    const mood = await db.query("SELECT 1 FROM mood_day WHERE instance_id = $1 AND day = $2::date + 1", [fam.instanceId, today]);
    assert.equal(mood.rowCount, 1);
    const run = await db.query<{ status: string }>('SELECT status FROM nightly_run WHERE child_id = $1', [fam.childId]);
    assert.equal(run.rows[0].status, 'done');
  });

  it('builds a weekly digest and notifies the parent', async () => {
    const weekStart = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    const id = await buildWeeklyDigest({ db, gateway, config, log: silentLogger, queue: createJobQueue(db) }, fam.childId, weekStart);
    assert.ok(id);
    const n = await db.query("SELECT 1 FROM notification WHERE kind = 'digest' AND ref_id = $1", [id]);
    assert.equal(n.rowCount, 1);
  });

  it('forgets everything but keeps the profile, toy and character', async () => {
    await forgetEverything(db, fam.childId);
    for (const table of ['fact', 'person', 'episode', 'turn', 'chat_session']) {
      const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE child_id = $1`, [fam.childId]);
      assert.equal(r.rows[0].n, 0, table);
    }
    const kept = await db.query<{ stage: string }>("SELECT relationship_stage AS stage FROM character_instance WHERE child_id = $1 AND status = 'active'", [fam.childId]);
    assert.equal(kept.rows[0].stage, 'meeting');
    const toy = await db.query("SELECT 1 FROM device WHERE child_id = $1 AND status = 'active'", [fam.childId]);
    assert.equal(toy.rowCount, 1);
  });

  it('runs queued jobs through the worker and maintenance', async () => {
    const queue = createJobQueue(db);
    const t = await addTurn(db, fam, 'My friend Bao is funny');
    await queue.enqueue('learn-turn', { turn_id: t.turnId });
    await queue.enqueue('maintenance', {});
    const worker = createWorker({ db, gateway, config, log: silentLogger, queue });
    assert.equal(await worker.drain(), 2);
    const bao = await db.query("SELECT 1 FROM person WHERE child_id = $1 AND display_name = 'Bao'", [fam.childId]);
    assert.equal(bao.rowCount, 1);
    await maintenance({ db, gateway, config, log: silentLogger, queue });
  });
});
