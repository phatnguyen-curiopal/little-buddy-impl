// A Buddy that lives only in the browser, end to end, the way the parent
// website will use it: register, set up a child and its Buddy, ask the API
// for a browser Buddy and its secret, then sign in to the real voice socket
// with that secret, the same way a physical toy signs in with the one
// written at the factory.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { buildApi } from '../../src/api/app.ts';
import { createOidcVerifier } from '../../src/auth/oidc.ts';
import type { Config } from '../../src/config.ts';
import type { Db } from '../../src/db/index.ts';
import { provisionDevices } from '../../src/devices/credentials.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { silentLogger } from '../../src/log.ts';
import { createDigestCache } from '../../src/memory/digest.ts';
import { ToyClient } from '../../src/sim/toy-client.ts';
import { createVoiceServer, type VoiceServer } from '../../src/voice/server.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';

const config = testConfig();

// In production the API and the voice service run as separate processes, so
// the API's hook cannot reach a live socket: here it only records the call,
// and the voice service has to notice a paused or released Buddy by itself.
function apiOn(db: Db, cfg: Config, blocked: string[]): FastifyInstance {
  return buildApi({ db, config: cfg, log: silentLogger, queue: createJobQueue(db), oidc: createOidcVerifier(cfg.auth), onDeviceBlocked: (id) => blocked.push(id) });
}

interface Parent {
  parentId: string;
  familyId: string;
  call: (method: string, url: string, body?: unknown, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
}

async function register(api: FastifyInstance, email: string, familyName: string): Promise<Parent> {
  const res = await api.inject({ method: 'POST', url: '/v1/auth/register', payload: { email, password: 'mango-season-2026', family_name: familyName } });
  assert.equal(res.statusCode, 201, res.body);
  const { access_token: token, parent, family } = res.json();
  return {
    parentId: parent.id,
    familyId: family.id,
    call: (method, url, body, headers = {}) =>
      api.inject({ method: method as 'GET', url: `/v1${url}`, payload: body as object | undefined, headers: { authorization: `Bearer ${token}`, ...headers } }),
  };
}

// The site's set-up wizard: a child, the questionnaire, the Buddy it matched.
async function childWithBuddy(p: Parent, name: string): Promise<string> {
  const child = await p.call('POST', '/children', { name, birth_date: '2020-05-01', languages: ['en'] });
  assert.equal(child.statusCode, 201, child.body);
  const childId = child.json().id as string;
  const match = await p.call('POST', `/children/${childId}/questionnaire`, {
    answers: [
      { question: 'friend_energy', answer: 'bouncy', by: 'child' },
      { question: 'friend_style', answer: 'silly', by: 'child' },
      { question: 'role', answer: 'friend', by: 'parent' },
      { question: 'language', answer: 'en', by: 'parent' },
    ],
  });
  assert.equal(match.statusCode, 201, match.body);
  const buddy = await p.call('POST', `/children/${childId}/buddy`, { questionnaire_id: match.json().questionnaire_id, character_slug: match.json().match.character.slug });
  assert.equal(buddy.statusCode, 201, buddy.body);
  return childId;
}

async function webBuddy(p: Parent, childId: string): Promise<string> {
  const res = await p.call('POST', '/devices/web', { child_id: childId });
  assert.equal(res.statusCode, 201, res.body);
  return res.json().id as string;
}

interface Wallet {
  balance: number;
  ledger: { kind: string; delta: number; reason: string | null; child_id: string | null; turn_id: string | null }[];
}

async function walletOf(p: Parent): Promise<Wallet> {
  const res = await p.call('GET', '/wallet');
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as Wallet;
}

// The voice service sends turn_done before it writes the turn and its
// charge, so a check that needs the write polls the database for it; polling
// the wallet route instead would run into the API's rate limit.
async function untilCharged(db: Db, familyId: string, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  const debits = async () => (await db.query("SELECT 1 FROM credit_ledger WHERE family_id = $1 AND kind = 'debit'", [familyId])).rowCount;
  while ((await debits()) === 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
}

// A tap the voice service answers by closing the socket never reaches
// turn_done; the turn's own timeout is caught here as "not answered", so it
// cannot surface later as an unhandled rejection.
async function tapRefused(toy: ToyClient): Promise<{ code: number; answered: boolean }> {
  const answered = toy.turn({ text: 'Are you there?', timeoutMs: 1000 }).then(() => true, () => false);
  return { code: await toy.waitForClose(), answered: await answered };
}

const closedAsBlocked = (e: { code?: number }) => e.code === 4003;

// One database for the whole file, as in production: the voice service
// keeps per-process state about the database it serves (which day's turn
// partition it has made), so a second database in this process would not
// behave like a real deployment.
describe('a Buddy that lives in the browser, end to end', () => {
  let db: Db;
  let api: FastifyInstance;
  let voice: VoiceServer;
  let url: string;
  // Toys the API asked to disconnect (pause, unpair).
  const blocked: string[] = [];
  // The voice id behind every sentence Buddy spoke.
  const spokeWith: string[] = [];
  // What each answer was asked with: the brief and the chat so far.
  const asked: string[] = [];
  const toys: ToyClient[] = [];

  let mai: Parent;
  let childId: string;
  let deviceId: string;
  let secret: string;
  // The browser tab that stays signed in from one test to the next.
  let tab: ToyClient;

  const toy = (id: string, key: string) => {
    const t = new ToyClient(id, key);
    toys.push(t);
    return t;
  };

  before(async () => {
    db = await createTestDb();
    const gateway = createFakeGateway();
    const speak = gateway.speak.bind(gateway);
    gateway.speak = (input) => {
      spokeWith.push(input.voiceId);
      return speak(input);
    };
    const reply = gateway.reply.bind(gateway);
    gateway.reply = (input) => {
      asked.push(input.messages.map((m) => m.content).join('\n'));
      return reply(input);
    };
    voice = createVoiceServer({ db, gateway, config, log: silentLogger, queue: createJobQueue(db), digests: createDigestCache() });
    url = `ws://127.0.0.1:${await voice.listen(0, '127.0.0.1')}/v1/device`;
    api = apiOn(db, config, blocked);
    mai = await register(api, 'mai@example.com', 'Nhà Mai');
    childId = await childWithBuddy(mai, 'Bông');
  });
  after(async () => {
    for (const t of toys) t.close();
    await voice?.close();
    await api?.close();
    await db?.close();
  });

  it('creates a browser Buddy, hands its family the secret, and answers it over the voice socket', async () => {
    const me = await mai.call('GET', '/me');
    assert.equal(me.json().web_toy, true, 'the site offers a browser Buddy only when the API says so');

    const created = await mai.call('POST', '/devices/web', { child_id: childId });
    assert.equal(created.statusCode, 201, created.body);
    assert.deepEqual([created.json().hardware_rev, created.json().status, created.json().child_id], ['web', 'active', childId]);
    deviceId = created.json().id;

    const cred = await mai.call('POST', `/devices/${deviceId}/credential`);
    assert.equal(cred.statusCode, 200, cred.body);
    assert.equal(cred.json().device_id, deviceId);
    secret = cred.json().secret;
    assert.equal(Buffer.from(secret, 'base64url').length, 32, 'the toy secret itself: there is no physical toy to protect');

    assert.equal((await walletOf(mai)).balance, 1000, 'a new family starts with its welcome credits');

    tab = toy(deviceId, secret);
    const ready = await tab.connect(url);
    assert.equal(ready.claimed, true);
    assert.equal(ready.language_mode, 'en');
    const r = await tab.turn({ text: 'I love mangoes' });
    assert.equal(r.result, 'answered');
    assert.ok(r.audio.length > 0, 'Buddy spoke');
    assert.ok(r.messages.some((m) => m.type === 'audio_end'));
  });

  it('charges the family exactly one credit for the answer, tied to the stored turn', async () => {
    await untilCharged(db, mai.familyId);
    const w = await walletOf(mai);
    assert.equal(w.balance, 999);
    const turns = await db.query<{ id: string }>('SELECT id FROM turn WHERE child_id = $1', [childId]);
    assert.equal(turns.rowCount, 1);
    assert.deepEqual(
      w.ledger.filter((l) => l.kind === 'debit').map((l) => ({ delta: l.delta, reason: l.reason, child_id: l.child_id, turn_id: l.turn_id })),
      [{ delta: -1, reason: 'turn', child_id: childId, turn_id: turns.rows[0].id }],
    );
    // The activity page shows the turn as paid for, and never its words.
    const activity = await mai.call('GET', '/turns');
    assert.equal(activity.statusCode, 200, activity.body);
    const listed = activity.json().data as Record<string, unknown>[];
    assert.deepEqual(listed.map((t) => [t.id, t.charged]), [[turns.rows[0].id, true]]);
    assert.ok(!('child_text' in listed[0]) && !('reply_text' in listed[0]));
  });

  it('speaks with the voice the parent picked on the site', async () => {
    const buddy = await mai.call('GET', `/children/${childId}/buddy`);
    const own = buddy.json().character_voices.en as string;
    assert.ok(spokeWith.length > 0 && spokeWith.every((v) => v === own), 'with no voice picked, the character speaks in its own');
    const voices = (await mai.call('GET', '/voices')).json().data as { id: string; language: string }[];
    const picked = voices.find((v) => v.language === 'en' && v.id !== own)!;
    const patched = await mai.call('PATCH', `/children/${childId}/buddy`, { voice_id: picked.id }, { 'if-match': buddy.headers.etag as string });
    assert.equal(patched.statusCode, 200, patched.body);

    spokeWith.length = 0;
    assert.equal((await tab.turn({ text: 'I love mangoes' })).result, 'answered');
    assert.ok(spokeWith.length > 0);
    assert.deepEqual([...new Set(spokeWith)], [picked.id]);
  });

  it('pausing it on the site shuts the browser out: at sign-in, and at the next tap of a tab already open', async () => {
    const paused = await mai.call('POST', `/devices/${deviceId}/pause`);
    assert.equal(paused.statusCode, 200, paused.body);
    assert.deepEqual([paused.json().status, paused.json().disabled_by], ['disabled', 'parent']);
    assert.ok(blocked.includes(deviceId), 'the API asked for the live socket to be closed');

    const cred = await mai.call('POST', `/devices/${deviceId}/credential`);
    assert.equal(cred.statusCode, 409, 'no secret for a sleeping Buddy');
    assert.equal(cred.json().type, '/problems/toy-not-active');

    await assert.rejects(toy(deviceId, secret).connect(url), closedAsBlocked);
    // The open tab is still connected, since the API could not reach it; the
    // voice service reads the toy's status again at every tap.
    assert.deepEqual(await tapRefused(tab), { code: 4003, answered: false });
  });

  it('waking it on the site lets the browser sign back in with the same secret and talk', async () => {
    const woke = await mai.call('POST', `/devices/${deviceId}/resume`);
    assert.equal(woke.statusCode, 200, woke.body);
    assert.deepEqual([woke.json().status, woke.json().disabled_by], ['active', null]);
    const cred = await mai.call('POST', `/devices/${deviceId}/credential`);
    assert.equal(cred.statusCode, 200, cred.body);
    assert.equal(cred.json().secret, secret);

    tab = toy(deviceId, secret);
    assert.equal((await tab.connect(url)).claimed, true);
    assert.equal((await tab.turn({ text: 'I love mangoes' })).result, 'answered');
  });

  it('unpairing revokes it for good, so a secret the browser kept no longer signs in', async () => {
    const asked = blocked.length;
    const res = await mai.call('POST', `/devices/${deviceId}/unpair`);
    assert.equal(res.statusCode, 204, res.body);
    const row = await db.query('SELECT status, family_id, child_id FROM device WHERE id = $1', [deviceId]);
    assert.deepEqual(row.rows, [{ status: 'revoked', family_id: null, child_id: null }]);
    assert.deepEqual(blocked.slice(asked), [deviceId], 'the API asked for the live socket to be closed');
    const listed = (await mai.call('GET', '/devices')).json().data as { id: string }[];
    assert.ok(!listed.some((d) => d.id === deviceId), 'gone from the family\'s toys');
    assert.equal((await mai.call('POST', `/devices/${deviceId}/credential`)).statusCode, 404);

    await assert.rejects(toy(deviceId, secret).connect(url), closedAsBlocked);
    assert.deepEqual(await tapRefused(tab), { code: 4003, answered: false });
  });

  it('never hands the browser a physical toy\'s secret, nor another family\'s Buddy', async () => {
    const [box] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'proto-1' });
    const na = await mai.call('POST', '/children', { name: 'Na', languages: ['en'] });
    assert.equal(na.statusCode, 201, na.body);
    // The code as printed on the box, typed into the site.
    const code = `${box.claim_code.slice(0, 4)}-${box.claim_code.slice(4)}`;
    const claimed = await mai.call('POST', '/devices/claim', { claim_code: code, child_id: na.json().id });
    assert.equal(claimed.statusCode, 201, claimed.body);
    assert.deepEqual([claimed.json().hardware_rev, claimed.json().status], ['proto-1', 'active']);

    const refused = await mai.call('POST', `/devices/${box.device_id}/credential`);
    assert.equal(refused.statusCode, 404);
    assert.equal(refused.json().type, '/problems/not-found');
    assert.equal(refused.json().secret, undefined);
    // The toy needs nothing from the site: it signs in with its factory secret.
    assert.equal((await toy(box.device_id, box.secret).connect(url)).claimed, true);

    const lan = await register(api, 'lan@example.com', 'Nhà Lan');
    const lanChild = await lan.call('POST', '/children', { name: 'Lan', languages: ['en'] });
    assert.equal(lanChild.statusCode, 201, lanChild.body);
    const lanBuddy = await webBuddy(lan, lanChild.json().id);
    assert.equal((await mai.call('POST', `/devices/${lanBuddy}/credential`)).statusCode, 404, 'another family\'s Buddy reads as missing');
    assert.equal((await lan.call('POST', `/devices/${lanBuddy}/credential`)).statusCode, 200);
  });

  describe('when the family has no credits', () => {
    // A family that signs up where no welcome credits are given has the
    // empty wallet a family reaches by spending them all. The append-only
    // ledger offers no other way there: only a debit may be negative, and a
    // debit needs a turn. The voice service is the same one as above.
    let noWelcome: FastifyInstance;
    let bao: Parent;
    let baoChild: string;
    let baoTab: ToyClient;

    before(async () => {
      noWelcome = apiOn(db, testConfig({ WELCOME_CREDITS: '0' }), blocked);
      bao = await register(noWelcome, 'bao@example.com', 'Nhà Bảo');
      baoChild = await childWithBuddy(bao, 'Bảo');
    });
    after(async () => {
      await noWelcome?.close();
    });

    it('answers a tap with the napping clip alone, and charges nothing', async () => {
      const id = await webBuddy(bao, baoChild);
      const cred = await bao.call('POST', `/devices/${id}/credential`);
      assert.equal(cred.statusCode, 200, cred.body);
      baoTab = toy(cred.json().device_id, cred.json().secret);
      assert.equal((await baoTab.connect(url)).claimed, true);

      const r = await baoTab.turn({ text: 'I love mangoes' });
      // An empty wallet looks like a napping toy: the clip is the whole
      // answer, with no face, no voice and no reason.
      assert.deepEqual(r.messages, [
        { type: 'play_clip', turn_id: r.turnId, clip: 'napping' },
        { type: 'turn_done', turn_id: r.turnId, result: 'blocked' },
      ]);
      assert.equal(r.audio.length, 0);

      // Long enough for a stray write after turn_done to land.
      await new Promise((res) => setTimeout(res, 200));
      assert.deepEqual(await walletOf(bao), { balance: 0, ledger: [] });
      const stored = await db.query('SELECT 1 FROM turn WHERE child_id = $1', [baoChild]);
      assert.equal(stored.rowCount, 0);
    });

    it('answers on the same tab once the parent buys credits', async () => {
      const opened = await bao.call('POST', '/purchases', { pack_id: 'starter' });
      assert.equal(opened.statusCode, 201, opened.body);
      const paid = await bao.call('POST', `/purchases/${opened.json().purchase.id}/demo-pay`, { outcome: 'success' });
      assert.equal(paid.statusCode, 200, paid.body);
      assert.equal(paid.json().balance, 20);

      assert.equal((await baoTab.turn({ text: 'I love mangoes' })).result, 'answered');
      await untilCharged(db, bao.familyId);
      assert.equal((await walletOf(bao)).balance, 19);
    });
  });

  describe("on the family's last credit", () => {
    // Families signed up here get exactly one credit.
    let one: FastifyInstance;
    const holds = async (familyId: string) => (await db.query('SELECT 1 FROM credit_hold WHERE family_id = $1', [familyId])).rowCount;
    const tabFor = async (p: Parent, childName: string) => {
      const id = await webBuddy(p, await childWithBuddy(p, childName));
      const cred = await p.call('POST', `/devices/${id}/credential`);
      assert.equal(cred.statusCode, 200, cred.body);
      const t = toy(cred.json().device_id, cred.json().secret);
      assert.equal((await t.connect(url)).claimed, true);
      return t;
    };

    before(() => {
      one = apiOn(db, testConfig({ WELCOME_CREDITS: '1' }), blocked);
    });
    after(async () => {
      await one?.close();
    });

    it('lets only one of two Buddies of one family start a turn on it', async () => {
      const lin = await register(one, 'lin@example.com', 'Nhà Lin');
      const [a, b] = [await tabFor(lin, 'An'), await tabFor(lin, 'Bi')];
      // An is still talking, at the pace of speech, when Bi taps.
      const aTurn = a.turn({ text: 'Tell me about the moon', pcm: Buffer.alloc(32_000), realtime: true, timeoutMs: 15_000 });
      await new Promise((res) => setTimeout(res, 300));
      const bTurn = await b.turn({ text: 'Me too!' });
      assert.equal(bTurn.result, 'blocked');
      assert.deepEqual(bTurn.clips, ['napping']);
      assert.equal((await aTurn).result, 'answered');
      await untilCharged(db, lin.familyId);
      assert.equal((await walletOf(lin)).balance, 0, 'one answer for one credit, never below zero');
      assert.equal(await holds(lin.familyId), 0, 'the hold became the charge');
      assert.equal((await b.turn({ text: 'Now me?' })).result, 'blocked', 'and the wallet is empty now');
    });

    it('gives the held credit back when a tab closes mid-turn', async () => {
      const kim = await register(one, 'kim@example.com', 'Nhà Kim');
      const first = await tabFor(kim, 'Khoa');
      const cut = first.turn({ text: 'Wait for me', pcm: Buffer.alloc(64_000), realtime: true, timeoutMs: 1_500 }).catch(() => null);
      await new Promise((res) => setTimeout(res, 300));
      assert.equal(await holds(kim.familyId), 1, 'the credit is held while the child talks');
      first.close();
      await cut;
      const until = Date.now() + 3000;
      while ((await holds(kim.familyId)) && Date.now() < until) await new Promise((res) => setTimeout(res, 20));
      assert.equal(await holds(kim.familyId), 0, 'closing the tab gave it back');
      assert.equal((await walletOf(kim)).balance, 1, 'and charged nothing');
      const second = await tabFor(kim, 'Khang');
      assert.equal((await second.turn({ text: 'Hello Buddy' })).result, 'answered', 'so another Buddy can use it');
    });
  });

  describe('a toy given to another child while it is connected', () => {
    // The API's hook only records here, as in production where it cannot
    // reach the voice service: the toy keeps its socket through the move.
    it("starts a new chat for the new child, without the first child's words", async () => {
      const ha = await register(api, 'ha@example.com', 'Nhà Hà');
      const xu = await childWithBuddy(ha, 'Xu');
      const yen = await childWithBuddy(ha, 'Yen');
      const [box] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'test' });
      assert.equal((await ha.call('POST', '/devices/claim', { claim_code: box.claim_code, child_id: xu })).statusCode, 201);
      const t = toy(box.device_id, box.secret);
      assert.equal((await t.connect(url)).claimed, true);
      // A word no prompt contains, so finding it later can only mean Xu's chat leaked.
      assert.equal((await t.turn({ text: 'My cat Zorblat is orange' })).result, 'answered');
      assert.ok(asked.at(-1)!.includes('Zorblat'), 'Xu talks to Buddy');

      assert.equal((await ha.call('POST', `/devices/${box.device_id}/unpair`)).statusCode, 204);
      assert.equal((await ha.call('POST', '/devices/claim', { claim_code: box.claim_code, child_id: yen })).statusCode, 201);
      const before = asked.length;
      assert.equal((await t.turn({ text: 'Hi, I am Yen' })).result, 'answered');

      const sessions = await db.query<{ child_id: string }>('SELECT child_id FROM chat_session WHERE device_id = $1 ORDER BY started_at', [box.device_id]);
      assert.deepEqual(sessions.rows.map((r) => r.child_id), [xu, yen], 'a chat of her own');
      const yensTurn = await db.query<{ child_id: string }>(
        'SELECT s.child_id FROM turn t JOIN chat_session s ON s.id = t.session_id WHERE t.child_id = $1',
        [yen],
      );
      assert.deepEqual(yensTurn.rows.map((r) => r.child_id), [yen]);
      assert.ok(asked.slice(before).every((brief) => !brief.includes('Zorblat')), "Buddy is not told Xu's words when Yen talks");
    });
  });
});
