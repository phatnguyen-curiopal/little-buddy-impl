import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Db } from '../../src/db/index.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import type { NameQuestion } from '../../src/gateway/types.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { createLogger, silentLogger } from '../../src/log.ts';
import { createDigestCache } from '../../src/memory/digest.ts';
import { ToyClient } from '../../src/sim/toy-client.ts';
import { createVoiceServer, type VoiceServer } from '../../src/voice/server.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();

describe('voice service end to end', () => {
  let db: Db;
  let voice: VoiceServer;
  let url: string;
  let fam: Family;
  const gateway = createFakeGateway();
  const toys: ToyClient[] = [];
  // Extra voice services, closed in after() so a failed assertion cannot leave one running.
  const servers: VoiceServer[] = [];

  const toyFor = (f: Family) => {
    const t = new ToyClient(f.device.device_id, f.device.secret);
    toys.push(t);
    return t;
  };

  before(async () => {
    db = await createTestDb();
    voice = createVoiceServer({ db, gateway, config, log: silentLogger, queue: createJobQueue(db), digests: createDigestCache() });
    url = `ws://127.0.0.1:${await voice.listen(0, '127.0.0.1')}/v1/device`;
    fam = await createFamily(db, config);
  });
  after(async () => {
    for (const t of toys) t.close();
    for (const s of servers) await s.close();
    await voice.close();
    await db.close();
  });

  it('signs in and reports the toy ready', async () => {
    const ready = await toyFor(fam).connect(url);
    assert.equal(ready.claimed, true);
    assert.equal(ready.codec, 'pcm16');
    assert.equal(ready.clips_version, 'bo-1');
  });

  it('answers a turn: faces, streamed audio, then turn_done', async () => {
    const toy = toys[0];
    const r = await toy.turn({ text: 'My dog Mochi fell in a puddle' });
    assert.equal(r.result, 'answered');
    assert.deepEqual(r.faces.slice(0, 3), ['listening', 'thinking', 'happy']);
    assert.ok(r.audio.length > 32_000, 'at least a second of speech');
    assert.ok(r.messages.some((m) => m.type === 'audio_end'));

    const turn = await db.query<{ child_text: string; face: string }>('SELECT child_text, face FROM turn WHERE child_id = $1', [fam.childId]);
    assert.deepEqual(turn.rows, [{ child_text: 'My dog Mochi fell in a puddle', face: 'happy' }]);
    const usage = await db.query<{ turns: number }>('SELECT turns FROM usage_daily WHERE child_id = $1', [fam.childId]);
    assert.equal(usage.rows[0].turns, 1);
    const job = await db.query("SELECT 1 FROM job WHERE queue = 'learn-turn'");
    assert.equal(job.rowCount, 1, 'learning is on, so the turn is queued for the learner');
  });

  it('streams audio frames to recognition and commits at turn_end', async () => {
    const before = { open: gateway.calls.openTranscription ?? 0, finish: gateway.calls.sttFinish ?? 0 };
    const r = await toys[0].turn({ pcm: Buffer.alloc(32_000) });
    assert.equal(r.result, 'answered');
    assert.equal((gateway.calls.openTranscription ?? 0) - before.open, 1);
    assert.equal((gateway.calls.sttFinish ?? 0) - before.finish, 1);
    assert.equal(gateway.calls.transcribe ?? 0, 0, 'no batch request when the stream works');
  });

  // A voice service whose 'turn timing' log lines the test can read.
  const timedVoice = async (g: ReturnType<typeof createFakeGateway>) => {
    const timings: Record<string, unknown>[] = [];
    const log = createLogger('info', {}, (line) => {
      const m = JSON.parse(line) as Record<string, unknown>;
      if (m.msg === 'turn timing') timings.push(m);
    });
    const v = createVoiceServer({ db, gateway: g, config, log, queue: createJobQueue(db), digests: createDigestCache() });
    servers.push(v);
    return { timings, url: `ws://127.0.0.1:${await v.listen(0, '127.0.0.1')}/v1/device` };
  };

  it('classifies and recalls while the child is still talking, then reuses it', async () => {
    const g = createFakeGateway({ transcript: 'Mochi fell in a puddle' });
    const { timings, url: u } = await timedVoice(g);
    const f = await createFamily(db, config);
    const t = toyFor(f);
    await t.connect(u);
    // 1.5 s of "speech" at microphone pace, then the toy's trailing silence:
    // partials after 0.9 s (three words) and 1.8 s (the whole sentence).
    const r = await t.turn({ pcm: Buffer.alloc(48_000), realtime: true, silenceMs: 900 });
    assert.equal(r.result, 'answered');
    assert.deepEqual([timings[0]?.reused, timings[0]?.speculations], [true, 2]);
    assert.ok(Number(timings[0]?.spec_lead_ms) > 300, 'the reused speculation started before turn_end');
    assert.equal(g.calls.classify, 2, 'one per partial, none after the final words');
    const turn = await db.query<{ child_text: string }>('SELECT child_text FROM turn WHERE child_id = $1', [f.childId]);
    assert.equal(turn.rows[0].child_text, 'Mochi fell in a puddle');
  });

  it('classifies again when the final words differ from the partial', async () => {
    const g = createFakeGateway({ transcript: 'Mochi fell in a puddle' });
    const open = g.openTranscription.bind(g);
    // A recogniser that revises the last word on commit.
    g.openTranscription = (opts) => {
      const s = open(opts);
      return { ...s, finish: async () => `${await s.finish()} today` };
    };
    const { timings, url: u } = await timedVoice(g);
    const f = await createFamily(db, config);
    const t = toyFor(f);
    await t.connect(u);
    const r = await t.turn({ pcm: Buffer.alloc(48_000), realtime: true, silenceMs: 900 });
    assert.equal(r.result, 'answered');
    assert.equal(timings[0]?.reused, false);
    assert.equal(g.calls.classify, 3, 'two speculations, then the final words');
    const turn = await db.query<{ child_text: string }>('SELECT child_text FROM turn WHERE child_id = $1', [f.childId]);
    assert.equal(turn.rows[0].child_text, 'Mochi fell in a puddle today');
  });

  it('reads a known name in context before telling Buddy who was mentioned', async () => {
    const briefs: string[] = [];
    const asked: NameQuestion[][] = [];
    const g = createFakeGateway({
      replyFor: (messages) => {
        briefs.push(messages.map((m) => m.content).join('\n'));
        return '[face:happy][tone:cheerful] Wowee!';
      },
    });
    // The child meant every name the turn asks about.
    const classify = g.classify.bind(g);
    g.classify = async (input) => {
      asked.push(input.names ?? []);
      const c = await classify(input);
      return input.names?.length ? { ...c, names: input.names.map((n) => ({ ref: n.ref, meant: true })) } : c;
    };
    const { url: u } = await timedVoice(g);
    const f = await createFamily(db, config);
    await db.query("INSERT INTO person (child_id, display_name, name_key, kind, relation) VALUES ($1, 'Mít', 'mit', 'friend', 'best friend')", [f.childId]);
    const t = toyFor(f);
    await t.connect(u);

    await t.turn({ text: 'Con thích ăn mít lắm' });
    assert.ok(!briefs[0].includes('PEOPLE THE CHILD JUST MENTIONED'));
    assert.ok(briefs[0].includes('"mít" here is the ordinary word (jackfruit), not Mít (best friend).'));

    await t.turn({ text: 'Hôm nay con chơi với bạn Mít' });
    assert.ok(briefs[1].includes('PEOPLE THE CHILD JUST MENTIONED (from your memory):\n- Mít: best friend'));
    assert.deepEqual(asked[1], [], 'a sure mention needs no question');

    await t.turn({ text: 'Mít hôm nay buồn lắm' });
    assert.deepEqual(asked[2].map((n) => [n.name, n.word]), [['Mít', 'jackfruit']]);
    assert.ok(briefs[2].includes('- Mít: best friend'), 'the classifier said the friend was meant');
  });

  it('treats a too-short clip as no speech, without a model call', async () => {
    const before = gateway.calls.reply ?? 0;
    const r = await toys[0].turn({ pcm: Buffer.alloc(1000) });
    assert.equal(r.result, 'no_speech');
    assert.deepEqual(r.clips, ['didnt_catch']);
    assert.equal(gateway.calls.reply ?? 0, before);
  });

  it('comforts on a danger signal and raises an urgent alert', async () => {
    const r = await toys[0].turn({ text: 'my brother hit me' });
    assert.equal(r.result, 'answered');
    assert.ok(!r.faces.includes('laughing') && !r.faces.includes('happy'), 'no cheerful face for a hurt child');
    const ev = await db.query<{ severity: string; excerpt: string; review_status: string }>('SELECT severity, excerpt, review_status FROM safety_event WHERE child_id = $1', [fam.childId]);
    assert.deepEqual(ev.rows, [{ severity: 'urgent', excerpt: 'my brother hit me', review_status: 'queued' }]);
    const alert = await db.query("SELECT 1 FROM job WHERE queue = 'send-alert'");
    assert.equal(alert.rowCount, 1);
  });

  it('cancels a reply when the child taps again, and stores nothing', async () => {
    // A slow voice, so the cancel lands while Buddy is still speaking.
    const slow = createFakeGateway();
    const speak = slow.speak.bind(slow);
    slow.speak = async function* (input) {
      for await (const chunk of speak(input)) {
        await new Promise((r) => setTimeout(r, 40));
        yield chunk;
      }
    };
    const v3 = createVoiceServer({ db, gateway: slow, config, log: silentLogger, queue: createJobQueue(db), digests: createDigestCache() });
    const u3 = `ws://127.0.0.1:${await v3.listen(0, '127.0.0.1')}/v1/device`;
    const f = await createFamily(db, config);
    const t = toyFor(f);
    await t.connect(u3);
    const r = await t.turn({ text: 'Tell me a story about a dragon', cancelAfterMs: 150 });
    assert.equal(r.result, 'cancelled');
    await new Promise((res) => setTimeout(res, 300));
    const stored = await db.query('SELECT 1 FROM turn WHERE child_id = $1', [f.childId]);
    assert.equal(stored.rowCount, 0);
    t.close();
    await v3.close();
  });

  it('gates turns: no Buddy yet, quiet hours', async () => {
    const noBuddy = await createFamily(db, config);
    await db.query("UPDATE character_instance SET status = 'archived' WHERE child_id = $1", [noBuddy.childId]);
    const t1 = toyFor(noBuddy);
    await t1.connect(url);
    const r1 = await t1.turn({ text: 'hello' });
    assert.deepEqual([r1.result, r1.clips], ['blocked', ['napping']]);

    const quiet = await createFamily(db, config);
    await db.query("UPDATE child_controls SET quiet_start = '00:00', quiet_end = '23:59' WHERE child_id = $1", [quiet.childId]);
    const t2 = toyFor(quiet);
    await t2.connect(url);
    const r2 = await t2.turn({ text: 'hello' });
    assert.deepEqual([r2.result, r2.clips], ['blocked', ['sleepy']]);
  });

  it('refuses bad signatures, blocked toys and old protocols', async () => {
    const bad = toyFor(fam);
    await assert.rejects(bad.connect(url, { badSignature: true }), (e: { code?: number }) => e.code === 4001);

    const revoked = await createFamily(db, config);
    await db.query("UPDATE device SET status = 'revoked' WHERE id = $1", [revoked.device.device_id]);
    await assert.rejects(toyFor(revoked).connect(url), (e: { code?: number }) => e.code === 4003);

    const old = await createFamily(db, config);
    await assert.rejects(toyFor(old).connect(url, { protocol: 2 }), (e: { code?: number }) => e.code === 4008);
  });

  it('closes the older socket when the same toy connects again, and kicks on unpair', async () => {
    const f = await createFamily(db, config);
    const first = toyFor(f);
    await first.connect(url);
    const second = toyFor(f);
    await second.connect(url);
    assert.equal(await first.waitForClose(), 4009);
    assert.equal(voice.kick(f.device.device_id), true);
    assert.equal(await second.waitForClose(), 4003);
  });

  it('keeps conversation history across turns within a session', async () => {
    const seen: number[] = [];
    const g = createFakeGateway({
      replyFor: (messages) => {
        seen.push(messages.filter((m) => m.role === 'user' || m.role === 'assistant').length);
        return '[face:happy] Okay!';
      },
    });
    const v2 = createVoiceServer({ db, gateway: g, config, log: silentLogger, queue: createJobQueue(db), digests: createDigestCache() });
    const u2 = `ws://127.0.0.1:${await v2.listen(0, '127.0.0.1')}/v1/device`;
    const f = await createFamily(db, config);
    const t = toyFor(f);
    await t.connect(u2);
    await t.turn({ text: 'one' });
    await t.turn({ text: 'two' });
    t.close();
    await v2.close();
    assert.deepEqual(seen, [1, 3], 'the second brief carries the first exchange');
  });
});
