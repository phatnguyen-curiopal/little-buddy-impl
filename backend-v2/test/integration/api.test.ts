import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApi } from '../../src/api/app.ts';
import type { Db } from '../../src/db/index.ts';
import { provisionDevices, type ManifestEntry } from '../../src/devices/credentials.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { silentLogger } from '../../src/log.ts';
import { createOidcVerifier } from '../../src/auth/oidc.ts';
import { ToyClient } from '../../src/sim/toy-client.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';

const config = testConfig();

describe('Parent API', () => {
  let db: Db;
  let app: FastifyInstance;
  let token: string;
  let refresh: string;
  let childId: string;
  let toy: ManifestEntry;
  const blocked: string[] = [];

  const call = (method: string, url: string, opts: { body?: unknown; headers?: Record<string, string>; auth?: string | null } = {}) =>
    app.inject({
      method: method as 'GET',
      url: `/v1${url}`,
      payload: opts.body as object | undefined,
      headers: { ...(opts.auth === null ? {} : { authorization: `Bearer ${opts.auth ?? token}` }), ...opts.headers },
    });

  async function signIn(email: string) {
    const start = await call('POST', '/auth/email/start', { body: { email }, auth: null });
    assert.equal(start.statusCode, 202);
    const res = await call('POST', '/auth/email/verify', { body: { email, code: start.json().dev_code }, auth: null });
    assert.equal(res.statusCode, 200);
    return res.json() as { access_token: string; refresh_token: string };
  }

  before(async () => {
    db = await createTestDb();
    app = buildApi({ db, config, log: silentLogger, queue: createJobQueue(db), oidc: createOidcVerifier(config.auth), onDeviceBlocked: (id) => blocked.push(id) });
    [toy] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
  });
  after(async () => {
    await app.close();
    await db.close();
  });

  it('signs in with an emailed code and rejects a wrong one', async () => {
    const tokens = await signIn('Parent@Example.com');
    token = tokens.access_token;
    refresh = tokens.refresh_token;
    const bad = await call('POST', '/auth/email/verify', { body: { email: 'parent@example.com', code: '000000' }, auth: null });
    assert.equal(bad.statusCode, 401);
    assert.equal(bad.headers['content-type'], 'application/problem+json; charset=utf-8');
    const me = await call('GET', '/me');
    assert.equal(me.json().parent.email, 'parent@example.com');
  });

  it('requires a token and validates bodies', async () => {
    assert.equal((await call('GET', '/me', { auth: null })).statusCode, 401);
    const bad = await call('POST', '/children', { body: { name: '' } });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().errors[0].field, 'name');
  });

  it('adds a child', async () => {
    const res = await call('POST', '/children', { body: { name: 'Bông', birth_date: '2020-05-01', languages: ['vi', 'en'] } });
    assert.equal(res.statusCode, 201);
    childId = res.json().id;
    assert.equal(res.json().family_id, undefined, 'family ids stay internal');
  });

  it('pairs a toy once, idempotently, and refuses a second family', async () => {
    const client = new ToyClient(toy.device_id, toy.secret);
    const claim = client.claimToken();
    const first = await call('POST', '/devices/claim', { body: { claim_token: claim, child_id: childId }, headers: { 'idempotency-key': 'k1' } });
    assert.equal(first.statusCode, 201);
    const replay = await call('POST', '/devices/claim', { body: { claim_token: claim, child_id: childId }, headers: { 'idempotency-key': 'k1' } });
    assert.deepEqual(replay.json(), first.json());
    const again = await call('POST', '/devices/claim', { body: { claim_token: claim, child_id: childId } });
    assert.equal(again.statusCode, 200, 'a retry by the owner is not an error');

    const other = await signIn('other@example.com');
    const otherChild = (await call('POST', '/children', { body: { name: 'Bảo' }, auth: other.access_token })).json().id;
    const stolen = await call('POST', '/devices/claim', { body: { claim_token: claim, child_id: otherChild }, auth: other.access_token });
    assert.equal(stolen.statusCode, 409);
    const forged = await call('POST', '/devices/claim', { body: { claim_token: `${claim.slice(0, -4)}AAAA`, child_id: childId } });
    assert.equal(forged.statusCode, 404);

    // Families cannot see each other's children.
    assert.equal((await call('GET', `/children/${childId}`, { auth: other.access_token })).statusCode, 404);
  });

  it('matches a character from the questionnaire and creates the Buddy', async () => {
    const qs = await call('GET', '/questionnaire', { headers: { 'accept-language': 'en' } });
    assert.ok(qs.json().questions.length >= 8);
    const match = await call('POST', `/children/${childId}/questionnaire`, {
      body: {
        answers: [
          { question: 'friend_energy', answer: 'bouncy', by: 'child' },
          { question: 'friend_style', answer: 'silly', by: 'child' },
          { question: 'together', answer: ['stories', 'draw'], by: 'child' },
          { question: 'favourite_animal', answer: 'dog', by: 'child' },
          { question: 'role', answer: 'friend', by: 'parent' },
          { question: 'language', answer: 'bilingual', by: 'parent' },
          { question: 'avoid_topics', answer: ['ghosts'], by: 'parent' },
        ],
      },
    });
    assert.equal(match.statusCode, 201);
    const { questionnaire_id: qid, match: best } = match.json();
    const created = await call('POST', `/children/${childId}/buddy`, { body: { questionnaire_id: qid, character_slug: best.character.slug } });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().language_mode, 'bilingual');
    const twice = await call('POST', `/children/${childId}/buddy`, { body: { questionnaire_id: qid, character_slug: best.character.slug } });
    assert.equal(twice.statusCode, 409);
    const controls = await call('GET', `/children/${childId}/controls`);
    assert.deepEqual(controls.json().topics_to_avoid, ['ghosts']);
    const facts = await call('GET', `/children/${childId}/facts`);
    assert.ok(facts.json().data.some((f: { source: string }) => f.source === 'setup'));
  });

  it('guards edits with If-Match', async () => {
    const buddy = await call('GET', `/children/${childId}/buddy`);
    const etag = buddy.headers.etag as string;
    assert.equal((await call('PATCH', `/children/${childId}/buddy`, { body: { dials: { energy: 100 } } })).statusCode, 428);
    const ok = await call('PATCH', `/children/${childId}/buddy`, { body: { dials: { energy: 100 } }, headers: { 'if-match': etag } });
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.json().dials.energy <= 100, 'clamped to the character range');
    const stale = await call('PATCH', `/children/${childId}/buddy`, { body: { role: 'teacher' }, headers: { 'if-match': etag } });
    assert.equal(stale.statusCode, 412);

    const fact = await call('POST', `/children/${childId}/facts`, { body: { category: 'fears', statement: 'scared of thunder' } });
    assert.equal(fact.statusCode, 201);
    const fixed = await call('PATCH', `/children/${childId}/facts/${fact.json().id}`, { body: { statement: 'a bit scared of thunder' }, headers: { 'if-match': fact.headers.etag as string } });
    assert.equal(fixed.statusCode, 200);
    assert.equal(fixed.json().source, 'parent');
    assert.equal((await call('DELETE', `/children/${childId}/facts/${fact.json().id}`)).statusCode, 204);
  });

  it('needs learning consent before Buddy may remember', async () => {
    const refused = await call('PATCH', `/children/${childId}`, { body: { learning_enabled: true } });
    assert.equal(refused.statusCode, 409);
    assert.equal((await call('POST', '/consents', { body: { kind: 'learning', version: '2026-10' } })).statusCode, 201);
    const on = await call('PATCH', `/children/${childId}`, { body: { learning_enabled: true } });
    assert.equal(on.json().learning_enabled, true);
    await call('DELETE', '/consents/learning');
    const child = await call('GET', `/children/${childId}`);
    assert.equal(child.json().learning_enabled, false, 'withdrawing consent switches learning off');
  });

  it('shows alerts with their excerpt, and nothing else carries words', async () => {
    await db.query(
      "INSERT INTO safety_event (child_id, severity, category, detected_by, excerpt) VALUES ($1, 'concern', 'left_out', 'classifier', 'nobody played with me'), ($1, 'info', 'moderation', 'input', NULL)",
      [childId],
    );
    const alerts = await call('GET', `/children/${childId}/alerts`);
    assert.equal(alerts.json().data.length, 1, 'info events are not alerts');
    assert.equal(alerts.json().data[0].excerpt, 'nobody played with me');
    assert.equal((await call('POST', `/children/${childId}/alerts/${alerts.json().data[0].id}/acknowledge`)).statusCode, 204);
  });

  it('posts nudges idempotently and edits controls', async () => {
    const a = await call('POST', `/children/${childId}/nudges`, { body: { content: 'Grandma visits on Saturday' }, headers: { 'idempotency-key': 'n1' } });
    const b = await call('POST', `/children/${childId}/nudges`, { body: { content: 'Grandma visits on Saturday' }, headers: { 'idempotency-key': 'n1' } });
    assert.equal(a.json().id, b.json().id);
    assert.equal((await call('GET', `/children/${childId}/nudges`)).json().data.length, 1);

    const controls = await call('GET', `/children/${childId}/controls`);
    const put = await call('PUT', `/children/${childId}/controls`, {
      body: { daily_limit_min: 30, quiet_start: '20:30', quiet_end: '06:30', bedtime: '20:00', topics_to_avoid: [], mood_pin: null },
      headers: { 'if-match': controls.headers.etag as string },
    });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().quiet_start, '20:30:00');
    const goals = await call('PUT', `/children/${childId}/goals`, { body: { focuses: ['sharing', 'english_words'] } });
    assert.equal(goals.json().data.length, 2);
  });

  it('rotates refresh tokens and ends every session when one is reused', async () => {
    const r1 = await call('POST', '/auth/refresh', { body: { refresh_token: refresh }, auth: null });
    assert.equal(r1.statusCode, 200);
    const reuse = await call('POST', '/auth/refresh', { body: { refresh_token: refresh }, auth: null });
    assert.equal(reuse.statusCode, 401);
    const r2 = await call('POST', '/auth/refresh', { body: { refresh_token: r1.json().refresh_token }, auth: null });
    assert.equal(r2.statusCode, 401, 'the newer token died with the family of sessions');
  });

  it('forgets everything, then unpairs and deletes the child', async () => {
    assert.equal((await call('DELETE', `/children/${childId}/memory`)).statusCode, 204);
    assert.equal((await call('GET', `/children/${childId}/facts`)).json().data.length, 0);
    assert.equal((await call('GET', `/children/${childId}/buddy`)).statusCode, 200, 'the Buddy stays');
    assert.equal((await call('DELETE', `/children/${childId}`)).statusCode, 204);
    const device = await db.query<{ status: string }>('SELECT status FROM device WHERE id = $1', [toy.device_id]);
    assert.equal(device.rows[0].status, 'provisioned', 'the toy can be paired again');
    assert.deepEqual(blocked, [toy.device_id], 'its live socket was closed');
  });
});
