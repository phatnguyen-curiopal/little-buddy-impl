import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApi } from '../../src/api/app.ts';
import { createOidcVerifier } from '../../src/auth/oidc.ts';
import type { Db } from '../../src/db/index.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import type { StructuredRequest } from '../../src/gateway/types.ts';
import { buildWeeklyDigest } from '../../src/jobs/nightly.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { silentLogger } from '../../src/log.ts';
import { learnFromTurn } from '../../src/memory/learner.ts';
import { recall } from '../../src/memory/recall.ts';
import { isUsable, loadTraits, updateTraits } from '../../src/memory/traits.ts';
import { toVectorLiteral } from '../../src/memory/vec.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();

async function addTurn(db: Db, fam: Family, childText: string, replyText = 'Wowee!'): Promise<string> {
  await db.query('SELECT ensure_turn_partition($1::date)', [new Date().toISOString().slice(0, 10)]);
  const sid = (await db.query<{ id: string }>('INSERT INTO chat_session (child_id, instance_id) VALUES ($1, $2) RETURNING id', [fam.childId, fam.instanceId])).rows[0].id;
  return (await db.query<{ id: string }>(
    "INSERT INTO turn (session_id, child_id, child_text, reply_text, face, turn_type, language) VALUES ($1, $2, $3, $4, 'happy', 'answer', 'vi') RETURNING id",
    [sid, fam.childId, childText, replyText],
  )).rows[0].id;
}

describe('growing up together in memory', () => {
  let db: Db;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  it('turns three nights across two weeks into a trait, one count a night', async () => {
    const fam = await createFamily(db, config);
    const gateway = createFakeGateway();
    const night = async () => {
      await db.query(
        "INSERT INTO episode (child_id, started_at, ended_at, points, category, importance) VALUES ($1, now() - interval '2 hours', now() - interval '1 hour', $2, 'play', 2)",
        [fam.childId, JSON.stringify([{ id: 1, text: 'was shy with the new kid at first' }])],
      );
      return updateTraits({ db, gateway }, fam.childId);
    };
    assert.equal(await night(), 1);
    assert.equal(await night(), 0, 'a re-run night counts once');
    // As if a week, then another, had passed between the nights.
    await db.query("UPDATE trait SET first_observed_at = now() - interval '14 days', last_observed_at = now() - interval '7 days' WHERE child_id = $1", [fam.childId]);
    assert.equal(await night(), 1);
    assert.equal(isUsable((await loadTraits(db, fam.childId))[0]), false, 'two nights are not a trait yet');
    await db.query("UPDATE trait SET last_observed_at = now() - interval '1 day' WHERE child_id = $1", [fam.childId]);
    await night();
    const [t] = await loadTraits(db, fam.childId);
    assert.deepEqual([t.name, t.observations, isUsable(t)], ['outgoing', 3, true]);
    assert.ok(t.value < -0.5 && t.confidence > 0);
  });

  it('keeps the second-language words taught and said, for review', async () => {
    const fam = await createFamily(db, config);
    await learnFromTurn({ db, gateway: createFakeGateway(), log: silentLogger }, await addTurn(db, fam, 'I like the cat', 'Con mèo tiếng Anh là "cat" đó!'));
    const w = await db.query("SELECT word, language, taught, used, next_review_at > now() + interval '20 hours' AS later FROM word_bank WHERE child_id = $1", [fam.childId]);
    assert.deepEqual(w.rows, [{ word: 'cat', language: 'en', taught: 1, used: 1, later: true }]);
  });

  it('finds an old difficulty for the growth mirror, links it to the new strength and tells the parents', async () => {
    const fam = await createFamily(db, config);
    const gateway = createFakeGateway();
    const [vec] = await gateway.embed(['learning to ride a bike without training wheels']);
    const old = (await db.query<{ id: string }>(
      `INSERT INTO fact (child_id, category, statement, source, confidence, embedding, first_seen_at)
       VALUES ($1, 'growing_edges', 'learning to ride a bike without training wheels', 'child', 0.8, $2, now() - interval '30 days') RETURNING id`,
      [fam.childId, toVectorLiteral(vec)],
    )).rows[0].id;
    const ask = () => recall({ db, gateway }, { childId: fam.childId, instanceId: fam.instanceId, text: 'I can ride my bike without training wheels now', budgetMs: 5000 });
    assert.deepEqual((await ask()).growth.map((g) => g.id), [old]);
    await db.query('UPDATE fact SET mirrored_at = now() WHERE id = $1', [old]);
    assert.deepEqual((await ask()).growth, [], 'not the same "remember when" twice in a month');

    const learner = createFakeGateway();
    learner.structured = (async (req: StructuredRequest) => (req.name === 'learn'
      ? {
        people: [], events: [], promises: [], relationship: [], canon: [], words: [],
        facts: [{ category: 'strengths', statement: 'rides a bike without training wheels', about: null, confidence: 0.9, reality: 'real', sensitivity: 'normal', corrects: 'learning to ride a bike without training wheels' }],
      }
      : gateway.structured(req))) as typeof learner.structured;
    await learnFromTurn({ db, gateway: learner, log: silentLogger }, await addTurn(db, fam, 'I can ride my bike now!'));
    const link = await db.query<{ status: string; after: string }>('SELECT o.status, n.statement AS after FROM fact o JOIN fact n ON n.id = o.superseded_by WHERE o.id = $1', [old]);
    assert.deepEqual(link.rows, [{ status: 'superseded', after: 'rides a bike without training wheels' }]);

    const weekStart = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    const id = await buildWeeklyDigest({ db, gateway, config, log: silentLogger, queue: createJobQueue(db) }, fam.childId, weekStart);
    const digest = await db.query<{ content: { growth: unknown } }>('SELECT content FROM digest WHERE id = $1', [id]);
    assert.deepEqual(digest.rows[0].content.growth, [{ before: 'learning to ride a bike without training wheels', after: 'rides a bike without training wheels' }]);
  });
});

describe('growing up together in the Parent API', () => {
  let db: Db;
  let app: ReturnType<typeof buildApi>;
  let token = '';
  let childId = '';
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url: `/v1${url}`, payload: body as object | undefined, headers: { authorization: `Bearer ${token}`, ...headers } });

  before(async () => {
    db = await createTestDb();
    app = buildApi({ db, config, log: silentLogger, queue: createJobQueue(db), oidc: createOidcVerifier(config.auth), onDeviceBlocked: () => {} });
    const start = await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'grow@example.com' } });
    const verify = await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'grow@example.com', code: start.json().dev_code } });
    token = verify.json().access_token;
    childId = (await call('POST', '/children', { name: 'Na', birth_date: '2020-05-01', languages: ['vi', 'en'] })).json().id;
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('shows traits with what they change, and lets a parent remove one', async () => {
    await db.query(
      "INSERT INTO trait (child_id, name, value, confidence, observations, first_observed_at) VALUES ($1, 'outgoing', -0.7, 0.4, 3, now() - interval '15 days'), ($1, 'curious', 0.5, 0.1, 1, now())",
      [childId],
    );
    const list = (await call('GET', `/children/${childId}/traits`)).json().data as { name: string; in_use: boolean; guidance: string }[];
    assert.deepEqual(list.map((t) => [t.name, t.in_use]).sort(), [['curious', false], ['outgoing', true]]);
    assert.match(list.find((t) => t.name === 'outgoing')!.guidance, /warm up slowly/);
    assert.equal((await call('DELETE', `/children/${childId}/traits/outgoing`)).statusCode, 204);
    assert.equal((await call('DELETE', `/children/${childId}/traits/outgoing`)).statusCode, 404);
  });

  it('lists the word bank, and keeps startle games and speaking first as parent switches', async () => {
    await db.query("INSERT INTO word_bank (child_id, word, word_key, language, meaning, taught, used) VALUES ($1, 'cat', 'cat', 'en', 'con mèo', 2, 1)", [childId]);
    const words = (await call('GET', `/children/${childId}/words`)).json().data;
    assert.deepEqual(words.map((w: { word: string; used: number }) => [w.word, w.used]), [['cat', 1]]);

    const got = await call('GET', `/children/${childId}/controls`);
    assert.deepEqual([got.json().surprise_play, got.json().speak_first], [true, false], 'startles on, speaking first off, by default');
    const body = { daily_limit_min: null, quiet_start: null, quiet_end: null, bedtime: '20:30', topics_to_avoid: [], mood_pin: null };
    const put = await call('PUT', `/children/${childId}/controls`, { ...body, surprise_play: false }, { 'if-match': got.headers.etag as string });
    assert.equal(put.statusCode, 200);
    assert.deepEqual([put.json().surprise_play, put.json().speak_first], [false, false]);
    const again = await call('PUT', `/children/${childId}/controls`, body, { 'if-match': put.headers.etag as string });
    assert.equal(again.json().surprise_play, false, 'an older client leaves the switches alone');
  });
});
