import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { buildApi } from '../../src/api/app.ts';
import { createOidcVerifier } from '../../src/auth/oidc.ts';
import type { Db } from '../../src/db/index.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import type { StructuredRequest } from '../../src/gateway/types.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { silentLogger } from '../../src/log.ts';
import { learnFromTurn } from '../../src/memory/learner.ts';
import { loadLexicon, noteSpeech, speechHabits, speechTerms } from '../../src/memory/speech.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();

describe('how one child speaks', () => {
  let db: Db;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  async function session(fam: Family) {
    await db.query('SELECT ensure_turn_partition($1::date)', [new Date().toISOString().slice(0, 10)]);
    return (await db.query<{ id: string }>('INSERT INTO chat_session (child_id, instance_id) VALUES ($1, $2) RETURNING id', [fam.childId, fam.instanceId])).rows[0].id;
  }
  async function turn(fam: Family, sid: string, child: string, reply: string, secondsAgo: number) {
    return (await db.query<{ id: string }>(
      `INSERT INTO turn (session_id, child_id, child_text, reply_text, face, turn_type, language, created_at)
       VALUES ($1, $2, $3, $4, 'happy', 'answer', 'vi', now() - make_interval(secs => $5)) RETURNING id`,
      [sid, fam.childId, child, reply, secondsAgo],
    )).rows[0].id;
  }

  it('learns a mishearing the child confirmed, and their own words, from the exchange before', async () => {
    const fam = await createFamily(db, config);
    const prompts: string[] = [];
    const g = createFakeGateway();
    g.structured = (async (req: StructuredRequest) => {
      prompts.push(req.user);
      return { people: [], facts: [], events: [], promises: [], relationship: [], canon: [], words: [], misheard: [{ heard: 'đau lăn', meant: 'đau răng' }], terms: ['Pikachu'] };
    }) as typeof g.structured;
    const sid = await session(fam);
    await turn(fam, sid, 'Bo ơi con bị đau lăn quá', 'Cậu bị đau răng hả?', 20);
    await learnFromTurn({ db, gateway: g, log: silentLogger }, await turn(fam, sid, 'Dạ, đau răng', 'Ôi, tội cậu quá!', 5));
    assert.match(prompts[0], /Before that, the child said: Bo ơi con bị đau lăn quá\nand Buddy replied: Cậu bị đau răng hả\?/);
    let lex = await loadLexicon(db, fam.childId);
    assert.deepEqual(speechHabits(lex), [], 'one sighting is not a habit yet');
    assert.deepEqual(speechTerms(lex), ['Pikachu']);
    await learnFromTurn({ db, gateway: g, log: silentLogger }, await turn(fam, sid, 'Răng con vẫn đau lăn', 'Mình nói với mẹ nhé.', 1));
    lex = await loadLexicon(db, fam.childId);
    assert.deepEqual(speechHabits(lex), [['đau lăn', 'đau răng']]);
  });

  it('never lets a learned guess overwrite what a parent wrote', async () => {
    const fam = await createFamily(db, config);
    await noteSpeech(db, fam.childId, { kind: 'misheard', heard: 'cái chăn', meant: 'cái trăng', source: 'parent' });
    await noteSpeech(db, fam.childId, { kind: 'misheard', heard: 'Cái chăn', meant: 'cái chăn bông', source: 'learned' });
    const [r] = await loadLexicon(db, fam.childId);
    assert.deepEqual([r.heard, r.meant, r.source, r.seen], ['cái chăn', 'cái trăng', 'parent', 2]);
    assert.equal(await noteSpeech(db, fam.childId, { kind: 'misheard', heard: 'răng', meant: 'Răng', source: 'learned' }), false, 'no change, no entry');
  });
});

describe('the speech lexicon in the Parent API', () => {
  let db: Db;
  let app: ReturnType<typeof buildApi>;
  let token = '';
  let childId = '';
  const call = (method: string, url: string, body?: unknown) =>
    app.inject({ method: method as 'GET', url: `/v1${url}`, payload: body as object | undefined, headers: { authorization: `Bearer ${token}` } });

  before(async () => {
    db = await createTestDb();
    app = buildApi({ db, config, log: silentLogger, queue: createJobQueue(db), oidc: createOidcVerifier(config.auth), onDeviceBlocked: () => {} });
    const start = await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'speech@example.com' } });
    token = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'speech@example.com', code: start.json().dev_code } })).json().access_token;
    childId = (await call('POST', '/children', { name: 'Na', birth_date: '2021-05-01', languages: ['vi'] })).json().id;
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('lets a parent teach Buddy how their child speaks, and take it back', async () => {
    const added = await call('POST', `/children/${childId}/speech`, { heard: 'đau lăn', meant: 'đau răng' });
    assert.equal(added.statusCode, 201);
    assert.deepEqual([added.json().kind, added.json().source, added.json().in_use], ['misheard', 'parent', true]);
    assert.equal((await call('POST', `/children/${childId}/speech`, { kind: 'term', heard: 'Siêu nhân Gao', meant: 'ignored' })).json().meant, 'Siêu nhân Gao');
    assert.equal((await call('POST', `/children/${childId}/speech`, { heard: 'răng', meant: 'răng' })).statusCode, 400);
    const list = (await call('GET', `/children/${childId}/speech`)).json().data as { id: string; heard: string }[];
    assert.deepEqual(list.map((r) => r.heard).sort(), ['Siêu nhân Gao', 'đau lăn']);
    assert.equal((await call('DELETE', `/children/${childId}/speech/${list[0].id}`)).statusCode, 204);
    assert.equal((await call('GET', `/children/${childId}/speech`)).json().data.length, 1);
  });
});
