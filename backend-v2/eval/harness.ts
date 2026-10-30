// Runs one scenario through the real pipeline: an in-process PostgreSQL
// (PGlite, migrated with the production migrations), the voice server, and
// the simulated toy speaking the device protocol with typed turns. Learning
// runs after every turn, as a fast worker would, and the nightly sleep runs
// between sessions. Only the voice is swapped out: speech is recorded as
// text, because the judge reads words, not audio.

import { SEED_CAST, latestPack, type Dials } from '../src/character/packs.ts';
import { localTime } from '../src/character/mood.ts';
import type { Config } from '../src/config.ts';
import type { Db } from '../src/db/index.ts';
import { provisionDevices } from '../src/devices/credentials.ts';
import type { Lang } from '../src/domain/types.ts';
import { createFakeGateway } from '../src/gateway/fake.ts';
import { createLiveGateway } from '../src/gateway/live.ts';
import type { ModelGateway } from '../src/gateway/types.ts';
import { handleJob } from '../src/jobs/handlers.ts';
import { nightlySleep } from '../src/jobs/nightly.ts';
import { createJobQueue } from '../src/jobs/queue.ts';
import type { Logger } from '../src/log.ts';
import { createDigestCache } from '../src/memory/digest.ts';
import { nameKey } from '../src/memory/names.ts';
import { toVectorLiteral } from '../src/memory/vec.ts';
import { ToyClient } from '../src/sim/toy-client.ts';
import { createVoiceServer } from '../src/voice/server.ts';
// Eval tooling borrows the test database: real Postgres in WebAssembly, no Docker.
import { createTestDb } from '../test/helpers/db.ts';
import { allAnswered } from './checks.ts';
import type { CheckOutcome, RunView, Scenario, Setup, TurnView, WorldState } from './types.ts';

export interface HarnessOptions {
  config: Config;
  log: Logger;
  // Speak through ElevenLabs as well; off by default, since the judge reads text.
  realTts?: boolean;
}

interface Capture {
  brief: TurnView['brief'];
  raw: string;
  spoken: string[];
  classification: TurnView['classification'];
}

export interface WorldInfo {
  childId: string;
  instanceId: string;
  timeZone: string;
  ageYears: number;
  slug: string;
  role: string;
  language: string;
  stage: string;
  dials: Dials;
  hour: number;
  bedtime: string;
  moodPin: number | null;
}

export interface ScenarioRun extends RunView {
  scenario: Scenario;
  world: WorldInfo;
  seeded: WorldState;
  between: string[];
  checks: (CheckOutcome & { label: string })[];
  errors: string[];
  ms: number;
}

// Wraps the gateway so each turn's brief, raw reply and spoken sentences are
// kept for the judge and the report.
function instrument(base: ModelGateway, capture: { turn: Capture | null }, realTts: boolean): ModelGateway {
  return {
    ...base,
    async classify(input) {
      const c = await base.classify(input);
      if (capture.turn) capture.turn.classification = c;
      return c;
    },
    reply(input) {
      if (capture.turn) capture.turn.brief = input.messages;
      const stream = base.reply(input);
      return (async function* () {
        for await (const delta of stream) {
          if (capture.turn) capture.turn.raw += delta;
          yield delta;
        }
      })();
    },
    async *speak(input) {
      capture.turn?.spoken.push(input.text);
      if (realTts) yield* base.speak(input);
      // A tenth of a second of silence per sentence keeps the protocol honest.
      else yield Buffer.alloc(3200);
    },
  };
}

// A time zone that puts the child's clock at the hour the scenario wants, so
// bedtime and after-school scenarios run at any real time of day.
export function zoneForHour(hour: number, now: Date = new Date()): string {
  let offset = (((hour - now.getUTCHours()) % 24) + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return 'Etc/GMT';
  // POSIX zone names invert the sign: Etc/GMT-7 is seven hours ahead of UTC.
  return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

function birthDateFor(age: number, today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - age);
  // Four months before the anniversary: old enough, and never the birthday.
  d.setUTCDate(d.getUTCDate() - 120);
  return d.toISOString().slice(0, 10);
}

const STAGE_HISTORY = { meeting: { days: 0, metDaysAgo: 0 }, buddies: { days: 12, metDaysAgo: 20 }, best_friends: { days: 40, metDaysAgo: 75 } } as const;

async function createWorld(db: Db, config: Config, gateway: ModelGateway, setup: Setup): Promise<WorldInfo & { deviceId: string; secret: string }> {
  const slug = setup.buddy ?? 'bo';
  const language = setup.language ?? 'en';
  const hour = setup.hour ?? 16;
  const timeZone = zoneForHour(hour);
  const today = localTime(timeZone).date;
  const age = setup.child?.age ?? 6;
  const languages: Lang[] = setup.child?.languages ?? (language === 'bilingual' ? ['vi', 'en'] : [language]);
  const stage = setup.stage ?? 'buddies';
  const bedtime = setup.bedtime ?? '20:30';
  const pack = (await latestPack(db, slug))!;
  const dials: Dials = { ...SEED_CAST.find((c) => c.slug === slug)!.profile.dials, ...setup.dials };

  // The session caches "partition ready" per process, and every scenario has
  // a fresh database, so the partitions are made here.
  for (const day of [0, 1]) await db.query('SELECT ensure_turn_partition((current_date + $1::int))', [day]);

  const familyId = (await db.query<{ id: string }>('INSERT INTO family DEFAULT VALUES RETURNING id')).rows[0].id;
  // Every answered turn costs a credit, as for a real family's welcome credits.
  await db.query("INSERT INTO credit_ledger (family_id, kind, delta, reason) VALUES ($1, 'grant', 1000, 'welcome')", [familyId]);
  const parentId = (await db.query<{ id: string }>(
    "INSERT INTO parent_user (family_id, email, auth_provider, auth_subject) VALUES ($1, $2, 'email', $2) RETURNING id",
    [familyId, `eval-${familyId}@example.com`],
  )).rows[0].id;
  const childId = (await db.query<{ id: string }>(
    `INSERT INTO child (family_id, name, nickname, birth_date, languages, time_zone, learning_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [familyId, setup.child?.name ?? 'Bông', setup.child?.nickname ?? null, birthDateFor(age, today), languages, timeZone, setup.child?.learning ?? true],
  )).rows[0].id;
  await db.query(
    'INSERT INTO child_controls (child_id, bedtime, mood_pin, topics_to_avoid) VALUES ($1, $2, $3, $4)',
    [childId, bedtime, setup.moodPin ?? null, setup.topicsToAvoid ?? []],
  );
  const history = STAGE_HISTORY[stage];
  const instanceId = (await db.query<{ id: string }>(
    `INSERT INTO character_instance (child_id, character_id, pack_version_id, role, language_mode, energy, playfulness, curiosity, warmth, structure, relationship_stage, met_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, current_date - $12::int) RETURNING id`,
    [childId, pack.characterId, pack.packVersionId, setup.role ?? 'friend', language, dials.energy, dials.playfulness, dials.curiosity, dials.warmth, dials.structure, stage, history.metDaysAgo],
  )).rows[0].id;
  // Past days together, so the nightly sleep keeps the stage the scenario set.
  for (let d = 1; d <= history.days; d += 1) {
    await db.query(
      "INSERT INTO chat_session (child_id, instance_id, started_at, ended_at) VALUES ($1, $2, now() - make_interval(days => $3), now() - make_interval(days => $3) + interval '10 minutes')",
      [childId, instanceId, d],
    );
  }
  const [device] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'eval' });
  await db.query("UPDATE device SET status = 'active', family_id = $2, child_id = $3, claimed_at = now() WHERE id = $1", [device.device_id, familyId, childId]);

  await seedMemory(db, gateway, { childId, instanceId, parentId, today }, setup);
  return {
    childId, instanceId, timeZone, ageYears: age, slug, role: setup.role ?? 'friend', language, stage, dials, hour, bedtime,
    moodPin: setup.moodPin ?? null, deviceId: device.device_id, secret: device.secret,
  };
}

async function seedMemory(db: Db, gateway: ModelGateway, ids: { childId: string; instanceId: string; parentId: string; today: string }, setup: Setup): Promise<void> {
  const s = setup.seed ?? {};
  const facts = s.facts ?? [];
  const people = s.people ?? [];
  const items = s.relationship ?? [];
  const canon = s.canon ?? [];
  const episodes = s.episodes ?? [];
  const texts = [
    ...facts.map((f) => f.statement),
    ...people.map((p) => `${p.name} ${p.relation ?? p.kind}`),
    ...items.map((r) => r.content),
    ...canon,
    ...episodes.map((e) => e.points.join(' ')),
  ];
  const vectors = texts.length ? (await gateway.embed(texts)).map(toVectorLiteral) : [];
  let v = 0;
  const { childId, instanceId } = ids;

  const personIds = new Map<string, string>();
  const factVecs = facts.map(() => vectors[v++]);
  for (const p of people) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO person (child_id, display_name, name_key, kind, relation, details, feeling, closeness, mentions, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [childId, p.name, nameKey(p.name), p.kind, p.relation ?? null, JSON.stringify(p.details ? { note: p.details } : {}), p.feeling ?? 0.6, p.closeness ?? 0.5, p.mentions ?? 3, vectors[v++]],
    );
    personIds.set(p.name, r.rows[0].id);
  }
  for (const [i, f] of facts.entries()) {
    await db.query(
      `INSERT INTO fact (child_id, person_id, category, statement, source, confidence, reality, sensitivity, first_seen_at, last_seen_at, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(days => $9), now() - make_interval(days => $9), $10)`,
      [childId, f.about ? (personIds.get(f.about) ?? null) : null, f.category, f.statement, f.source ?? 'child', f.confidence ?? 0.8, f.reality ?? 'real', f.sensitivity ?? 'normal', f.daysAgo ?? 7, factVecs[i]],
    );
  }
  for (const r of items) {
    await db.query('INSERT INTO relationship_item (child_id, kind, content, embedding) VALUES ($1, $2, $3, $4)', [childId, r.kind, r.content, vectors[v++]]);
  }
  for (const c of canon) {
    await db.query("INSERT INTO buddy_canon (instance_id, statement, source, embedding) VALUES ($1, $2, 'said', $3)", [instanceId, c, vectors[v++]]);
  }
  for (const e of episodes) {
    await db.query(
      `INSERT INTO episode (child_id, started_at, ended_at, points, feelings, category, importance, embedding)
       VALUES ($1, now() - make_interval(days => $2) - interval '15 minutes', now() - make_interval(days => $2), $3, $4, $5, $6, $7)`,
      [childId, e.daysAgo, JSON.stringify(e.points.map((text, i) => ({ id: i + 1, text }))), e.feelings ?? [], e.category ?? 'other', e.importance ?? 3, vectors[v++]],
    );
  }
  // Due a couple of hours ago, so the director sees them as due now.
  for (const e of s.events ?? []) {
    await db.query(
      `INSERT INTO child_event (child_id, person_id, kind, description, starts_on, follow_up_due)
       VALUES ($1, $2, $3, $4, current_date + $5::int - 1, now() + make_interval(days => $5) - interval '2 hours')`,
      [childId, e.person ? (personIds.get(e.person) ?? null) : null, e.kind ?? 'upcoming', e.description, e.dueInDays ?? 0],
    );
  }
  for (const p of s.promises ?? []) {
    await db.query(
      "INSERT INTO relationship_item (child_id, kind, content, due_at) VALUES ($1, 'promise', $2, now() + make_interval(days => $3) - interval '2 hours')",
      [childId, p.content, p.dueInDays ?? 0],
    );
  }
  for (const [i, d] of (s.diary ?? []).entries()) {
    await db.query('INSERT INTO diary_entry (instance_id, day, slot, story, valence) VALUES ($1, $2::date, $3, $4, $5)', [instanceId, ids.today, i + 1, d.story, d.valence ?? 'normal']);
  }
  for (const n of s.nudges ?? []) {
    await db.query("INSERT INTO nudge (child_id, parent_id, content, use_after) VALUES ($1, $2, $3, now() - interval '1 hour')", [childId, ids.parentId, n]);
  }
}

// Days pass by moving the past further back: every timestamp the memory
// system reads shifts by the same amount, which is what "tomorrow" means to
// Buddy. Date-keyed rows go through a far offset first so no row collides
// with one that has not moved yet.
export async function advanceDays(db: Db, childId: string, instanceId: string, days: number): Promise<void> {
  const back = (col: string) => `${col} = ${col} - make_interval(days => $2)`;
  const byChild = [
    `UPDATE chat_session SET ${back('started_at')}, ${back('ended_at')} WHERE child_id = $1`,
    `UPDATE fact SET ${back('first_seen_at')}, ${back('last_seen_at')} WHERE child_id = $1`,
    `UPDATE person SET ${back('first_mentioned_at')}, ${back('last_mentioned_at')} WHERE child_id = $1`,
    `UPDATE child_event SET starts_on = starts_on - $2::int, ends_on = ends_on - $2::int, ${back('created_at')}, ${back('follow_up_due')} WHERE child_id = $1`,
    `UPDATE episode SET ${back('started_at')}, ${back('ended_at')} WHERE child_id = $1`,
    `UPDATE relationship_item SET ${back('due_at')}, ${back('created_at')}, ${back('last_used_at')} WHERE child_id = $1`,
    `UPDATE nudge SET ${back('use_after')}, ${back('expires_at')} WHERE child_id = $1`,
  ];
  const byInstance = [
    `UPDATE buddy_canon SET ${back('created_at')} WHERE instance_id = $1`,
    'UPDATE character_instance SET met_on = met_on - $2::int WHERE id = $1',
  ];
  for (const sql of byChild) await db.query(sql, [childId, days]);
  for (const sql of byInstance) await db.query(sql, [instanceId, days]);
  for (const [table, key, id] of [['diary_entry', 'instance_id', instanceId], ['mood_day', 'instance_id', instanceId], ['usage_daily', 'child_id', childId], ['nightly_run', 'child_id', childId]]) {
    await db.query(`UPDATE ${table} SET day = day - 100000 WHERE ${key} = $1`, [id]);
    await db.query(`UPDATE ${table} SET day = day + 100000 - $2::int WHERE ${key} = $1`, [id, days]);
  }
}

async function snapshot(db: Db, childId: string, instanceId: string): Promise<WorldState> {
  const q = async <T>(sql: string, id = childId) => (await db.query<T>(sql, [id])).rows;
  return {
    facts: await q(`SELECT f.statement, f.category, f.confidence, f.reality, f.sensitivity, f.status, f.source, p.display_name AS about
                    FROM fact f LEFT JOIN person p ON p.id = f.person_id WHERE f.child_id = $1 ORDER BY f.first_seen_at, f.statement`),
    people: await q("SELECT display_name AS name, kind, relation, mentions FROM person WHERE child_id = $1 AND status = 'active' ORDER BY first_mentioned_at, display_name"),
    events: await q('SELECT description, kind, status FROM child_event WHERE child_id = $1 ORDER BY created_at'),
    relationship: await q('SELECT kind, content, status FROM relationship_item WHERE child_id = $1 ORDER BY created_at'),
    canon: await q("SELECT statement, source FROM buddy_canon WHERE instance_id = $1 AND status = 'active' ORDER BY created_at", instanceId),
    safety: await q('SELECT severity, category, detected_by FROM safety_event WHERE child_id = $1'),
    notifications: await q('SELECT kind FROM notification WHERE child_id = $1'),
    nudges: await q('SELECT content, status FROM nudge WHERE child_id = $1'),
    episodes: (await q<{ points: { text: string }[] }>('SELECT points FROM episode WHERE child_id = $1 ORDER BY ended_at')).map((e) => ({ points: e.points.map((p) => p.text) })),
  };
}

// turn_done reaches the toy before the turn is stored, so wait for the row.
async function storedTurn(db: Db, childId: string, n: number): Promise<{ face: string; turn_type: string; reply_text: string } | null> {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    const rows = (await db.query<{ face: string; turn_type: string; reply_text: string }>(
      'SELECT face, turn_type, reply_text FROM turn WHERE child_id = $1 ORDER BY created_at', [childId],
    )).rows;
    if (rows.length >= n) return rows[n - 1];
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export function createScenarioGateway(opts: HarnessOptions, capture: { turn: Capture | null }): ModelGateway {
  const base = opts.config.gateway === 'live' ? createLiveGateway(opts.config, opts.log) : createFakeGateway();
  return instrument(base, capture, Boolean(opts.realTts));
}

export async function runScenario(scenario: Scenario, opts: HarnessOptions): Promise<ScenarioRun> {
  const started = performance.now();
  const { config, log } = opts;
  const capture: { turn: Capture | null } = { turn: null };
  const gateway = createScenarioGateway(opts, capture);
  const db = await createTestDb();
  const queue = createJobQueue(db);
  const digests = createDigestCache();
  const voice = createVoiceServer({ db, gateway, config, log, queue, digests });
  const errors: string[] = [];
  const between: string[] = [];
  const turns: TurnView[] = [];
  try {
    const url = `ws://127.0.0.1:${await voice.listen(0, '127.0.0.1')}/v1/device`;
    const world = await createWorld(db, config, gateway, scenario.setup ?? {});
    const seeded = await snapshot(db, world.childId, world.instanceId);
    const deps = { db, gateway, config, log, queue };

    const drain = async () => {
      for (;;) {
        const job = await queue.claim(['learn-turn', 'send-alert']);
        if (!job) return;
        try {
          await handleJob(deps, job);
        } catch (err) {
          // One retry for a flaky vendor call, then the error is reported.
          try {
            await handleJob(deps, job);
          } catch (again) {
            errors.push(`${job.queue}: ${(again as Error).message}`);
          }
        }
        await queue.complete(job.id);
      }
    };

    let answered = 0;
    for (const [si, session] of scenario.sessions.entries()) {
      const toy = new ToyClient(world.deviceId, world.secret);
      await toy.connect(url);
      for (const [ti, text] of session.turns.entries()) {
        capture.turn = { brief: null, raw: '', spoken: [], classification: null };
        const r = await toy.turn({ text, timeoutMs: 120_000 });
        const got = capture.turn;
        capture.turn = null;
        const row = r.result === 'answered' ? await storedTurn(db, world.childId, ++answered) : null;
        turns.push({
          ref: `${si + 1}.${ti + 1}`, session: si + 1, child: text, result: r.result,
          reply: row?.reply_text ?? '', raw: got.raw, spoken: got.spoken, face: row?.face ?? null, turnType: row?.turn_type ?? null,
          classification: got.classification, firstAudioMs: r.firstAudioMs, brief: got.brief,
        });
        await drain();
      }
      toy.close();
      await db.query('UPDATE chat_session SET ended_at = now() WHERE child_id = $1 AND ended_at IS NULL', [world.childId]);
      await drain();
      if (session.after?.sleep) {
        try {
          await nightlySleep(deps, world.childId, localTime(world.timeZone).date);
          between.push(`after session ${si + 1}: Buddy slept (episodes, diary and mood for tomorrow)`);
        } catch (err) {
          errors.push(`nightly: ${(err as Error).message}`);
        }
      }
      if (session.after?.days) {
        await advanceDays(db, world.childId, world.instanceId, session.after.days);
        between.push(`after session ${si + 1}: ${session.after.days} day(s) passed`);
      }
      digests.invalidate(world.childId);
    }

    const state = await snapshot(db, world.childId, world.instanceId);
    const view: RunView = { turns, state };
    const checks = [allAnswered, ...(scenario.checks ?? [])].map((c) => {
      try {
        return { label: c.label, ...c.run(view) };
      } catch (err) {
        return { label: c.label, pass: false, detail: `check crashed: ${(err as Error).message}` };
      }
    });
    const { deviceId: _d, secret: _s, ...info } = world;
    return { scenario, world: info, seeded, between, turns, state, checks, errors, ms: Math.round(performance.now() - started) };
  } finally {
    await voice.close();
    await db.close();
  }
}
