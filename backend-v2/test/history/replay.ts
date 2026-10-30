// Replays children's years through the backend under a mocked clock: setup
// and every later parent action go through the Parent API, each conversation
// is persisted the way the voice service persists a turn, and the learner,
// nightly sleep, weekly digests and maintenance run in the real worker on the
// real schedule. What the database holds afterwards is what the backend made
// of the year, and it is the initial data for the history tests.
//
// The voice pipeline itself (speech, the reply model, TTS) is not replayed:
// the transcript and Buddy's words come from the history. The bookkeeping a
// turn does around them is mirrored from src/voice/session.ts (persist) and
// src/voice/turn.ts (classification, the director, follow-ups, nudges).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

import { buildApi } from '../../src/api/app.ts';
import { signAccess } from '../../src/auth/jwt.ts';
import { createOidcVerifier } from '../../src/auth/oidc.ts';
import { decide } from '../../src/character/director.ts';
import { enforceChildFirst } from '../../src/character/emotions.ts';
import { ageInYears, dailyMood, energyPhase, localTime } from '../../src/character/mood.ts';
import { activeBuddy } from '../../src/character/packs.ts';
import type { Config } from '../../src/config.ts';
import { provisionDevices } from '../../src/devices/credentials.ts';
import type { Classification } from '../../src/domain/types.ts';
import { fakeClassify } from '../../src/gateway/fake.ts';
import { scheduleTick } from '../../src/jobs/handlers.ts';
import type { WorkerDeps } from '../../src/jobs/nightly.ts';
import { createJobQueue } from '../../src/jobs/queue.ts';
import { createWorker } from '../../src/jobs/worker.ts';
import { createLogger, type Logger } from '../../src/log.ts';
import { dueItems } from '../../src/memory/recall.ts';
import { recordSafetyEvent } from '../../src/safety/events.ts';
import { ToyClient } from '../../src/sim/toy-client.ts';
import { testConfig } from '../helpers/db.ts';
import { startClock, type Clock } from './clock.ts';
import { createHistoryGateway, episodeTranscript, type HistoryGateway } from './gateway.ts';
import { createCopyableDb, type CopyableDb } from './pglite.ts';
import { planActions, planSessions, type PlannedSession } from './plan.ts';
import { HISTORY_END, addDays, localDate, localToUtc } from './time.ts';
import type { ControlsBody, KidHistory, ParentAction } from './types.ts';

export interface KidIds {
  familyId: string;
  parentId: string;
  childId: string;
  deviceId: string;
}

export interface FollowUp {
  kid: string;
  kind: 'event' | 'promise';
  text: string;
  at: Date;
  session: string;
}

export interface ReplayRecord {
  sessions: Map<string, string>; // planned session id -> chat_session id
  turns: Map<string, string[]>; // planned session id -> turn ids
  followUps: FollowUp[];
  stages: Record<string, { date: string; stage: string }[]>;
  logged: string[]; // warnings and errors the backend logged during the year
  jobs: number;
  ms: number;
}

export interface Api {
  app: FastifyInstance;
  call(kid: string, method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
}

export interface Year extends Api {
  db: CopyableDb;
  config: Config;
  gateway: HistoryGateway;
  clock: Clock;
  log: Logger;
  kids: Record<string, KidIds>;
  histories: Record<string, KidHistory>;
  plans: Record<string, PlannedSession[]>;
  record: ReplayRecord;
  deps(db?: CopyableDb): WorkerDeps;
  token(kid: string): string;
  // A copy of the year's database with its own API, for tests that change data.
  copy(): Promise<{ db: CopyableDb; api: Api; deps: WorkerDeps; close(): Promise<void> }>;
  close(): Promise<void>;
}

type Event =
  | { at: Date; order: 0; kind: 'setup'; kid: KidHistory }
  | { at: Date; order: 1; kind: 'action'; kid: KidHistory; action: ParentAction }
  | { at: Date; order: 2; kind: 'session'; kid: KidHistory; session: PlannedSession }
  | { at: Date; order: 3; kind: 'tick'; timeZone: string };

function makeApi(app: FastifyInstance, config: Config, kids: Record<string, KidIds>): Api {
  return {
    app,
    async call(kid, method, url, body, headers = {}) {
      const ids = kids[kid];
      const token = signAccess(config.jwtSecret, { sub: ids.parentId, fam: ids.familyId }, config.auth.accessTtlSec);
      return app.inject({ method: method as 'GET', url: `/v1${url.replaceAll(':child', ids.childId)}`, payload: body as object | undefined, headers: { authorization: `Bearer ${token}`, ...headers } });
    },
  };
}

function ok(res: LightMyRequestResponse, what: string): LightMyRequestResponse {
  if (res.statusCode >= 300) throw new Error(`${what}: ${res.statusCode} ${res.body}`);
  return res;
}

export async function replayYear(histories: KidHistory[], opts: { end?: Date } = {}): Promise<Year> {
  const end = opts.end ?? HISTORY_END;
  const startedAt = performance.now();
  const setups = histories.map((h) => localToUtc(h.start, h.child.timeZone).getTime());
  const clock = startClock(Math.min(...setups) - 3_600_000);
  const config = testConfig();
  const record: ReplayRecord = { sessions: new Map(), turns: new Map(), followUps: [], stages: {}, logged: [], jobs: 0, ms: 0 };
  const log = createLogger('warn', {}, (line) => record.logged.push(line));
  const db = await createCopyableDb();
  const gateway = createHistoryGateway();
  const deps = (d: CopyableDb = db): WorkerDeps => ({ db: d, gateway, config, log, queue: createJobQueue(d) });
  const workerDeps = deps();
  const worker = createWorker(workerDeps);
  const kids: Record<string, KidIds> = {};
  const api = makeApi(buildApi({ db, config, log, queue: workerDeps.queue, oidc: createOidcVerifier(config.auth) }), config, kids);
  const partitions = new Set<string>();

  const drain = async () => {
    record.jobs += await worker.drain(100_000);
  };

  async function setup(kid: KidHistory) {
    const start = ok(await api.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: kid.parent.email } }), `${kid.key} sign-in`);
    const verify = ok(await api.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: kid.parent.email, code: start.json().dev_code } }), `${kid.key} verify`);
    const me = ok(await api.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${verify.json().access_token}` } }), `${kid.key} me`).json();
    kids[kid.key] = { parentId: me.parent.id, familyId: me.family.id, childId: '', deviceId: '' };
    const call = (method: string, url: string, body?: unknown, headers?: Record<string, string>) => api.call(kid.key, method, url, body, headers).then((r) => ok(r, `${kid.key} ${method} ${url}`));

    await call('PATCH', '/me', { display_name: kid.parent.name });
    for (const kind of ['terms', 'privacy', ...(kid.setup.learning ? ['learning'] : [])]) await call('POST', '/consents', { kind, version: '2025-09' });
    const c = kid.child;
    const child = (await call('POST', '/children', { name: c.name, nickname: c.nickname, birth_date: c.birthDate, languages: c.languages, time_zone: c.timeZone, city: c.city })).json();
    kids[kid.key].childId = child.id;
    const [device] = await provisionDevices(db, config.deviceKek, { count: 1, hardwareRev: 'history' });
    kids[kid.key].deviceId = device.device_id;
    await call('POST', '/devices/claim', { claim_token: new ToyClient(device.device_id, device.secret).claimToken(), child_id: child.id });
    const q = (await call('POST', '/children/:child/questionnaire', { answers: kid.setup.answers }, { 'accept-language': kid.locale })).json();
    await call('POST', '/children/:child/buddy', { questionnaire_id: q.questionnaire_id, character_slug: kid.setup.slug });
    if (kid.setup.learning) await call('PATCH', '/children/:child', { learning_enabled: true });
    await controls(kid, kid.setup.controls);
    if (kid.setup.goals.length) await call('PUT', '/children/:child/goals', { focuses: kid.setup.goals });
    record.stages[kid.key] = [{ date: localDate(clock.now(), c.timeZone), stage: 'meeting' }];
  }

  async function controls(kid: KidHistory, set: Partial<ControlsBody>) {
    const current = ok(await api.call(kid.key, 'GET', '/children/:child/controls'), `${kid.key} controls`);
    const { updated_at: _u, etag: _e, ...body } = current.json();
    ok(await api.call(kid.key, 'PUT', '/children/:child/controls', { ...body, ...set }, { 'if-match': current.headers.etag as string }), `${kid.key} put controls`);
  }

  async function findAll(kid: string, url: string): Promise<Record<string, any>[]> {
    const out: Record<string, any>[] = [];
    let cursor: string | null = null;
    do {
      const res = ok(await api.call(kid, 'GET', `${url}?limit=100${cursor ? `&cursor=${cursor}` : ''}`), `${kid} GET ${url}`);
      out.push(...res.json().data);
      cursor = res.json().next_cursor;
    } while (cursor);
    return out;
  }

  async function act(kid: KidHistory, a: ParentAction) {
    const call = (method: string, url: string, body?: unknown, headers?: Record<string, string>) => api.call(kid.key, method, url, body, headers).then((r) => ok(r, `${kid.key} ${a.do} at ${a.at}`));
    const fact = async (s: string) => {
      const found = (await findAll(kid.key, '/children/:child/facts')).find((f) => f.statement.toLowerCase() === s.toLowerCase());
      if (!found) throw new Error(`${kid.key} ${a.do} at ${a.at}: no fact "${s}"`);
      return found;
    };
    const person = async (name: string) => {
      const found = (await findAll(kid.key, '/children/:child/people')).find((p) => p.display_name === name);
      if (!found) throw new Error(`${kid.key} ${a.do} at ${a.at}: no person "${name}"`);
      return found;
    };
    switch (a.do) {
      case 'fact':
        await call('POST', '/children/:child/facts', { category: a.cat, statement: a.s });
        return;
      case 'fix-fact': {
        const f = await fact(a.s);
        await call('PATCH', `/children/:child/facts/${f.id}`, { statement: a.to }, { 'if-match': f.etag });
        return;
      }
      case 'delete-fact':
        await call('DELETE', `/children/:child/facts/${(await fact(a.s)).id}`);
        return;
      case 'rename-person': {
        const p = await person(a.name);
        await call('PATCH', `/children/:child/people/${p.id}`, { display_name: a.to }, { 'if-match': p.etag });
        return;
      }
      case 'delete-person':
        await call('DELETE', `/children/:child/people/${(await person(a.name)).id}`);
        return;
      case 'nudge':
        await call('POST', '/children/:child/nudges', {
          content: a.content,
          expires_at: a.expiresInDays ? new Date(Date.now() + a.expiresInDays * 86_400_000).toISOString() : null,
        });
        return;
      case 'ack-alerts':
        for (const alert of await findAll(kid.key, '/children/:child/alerts')) {
          if (!alert.acknowledged_at) await call('POST', `/children/:child/alerts/${alert.id}/acknowledge`);
        }
        return;
      case 'controls':
        await controls(kid, a.set);
        return;
      case 'goals':
        await call('PUT', '/children/:child/goals', { focuses: a.focuses });
        return;
      case 'learning':
        if (a.on) {
          await call('POST', '/consents', { kind: 'learning', version: '2026-08' });
          await call('PATCH', '/children/:child', { learning_enabled: true });
        } else {
          await call('DELETE', '/consents/learning');
        }
        return;
      case 'change-buddy': {
        const q = (await call('POST', '/children/:child/questionnaire', { answers: a.answers }, { 'accept-language': kid.locale })).json();
        await call('POST', '/children/:child/buddy/change', { questionnaire_id: q.questionnaire_id, character_slug: a.slug, confirm: true });
        return;
      }
    }
  }

  async function converse(kid: KidHistory, s: PlannedSession) {
    const ids = kids[kid.key];
    clock.set(s.start);
    const child = (await db.query<{ birth_date: string | null; languages: string[]; time_zone: string; learning_enabled: boolean }>(
      'SELECT birth_date::text AS birth_date, languages, time_zone, learning_enabled FROM child WHERE id = $1',
      [ids.childId],
    )).rows[0];
    const buddy = await activeBuddy(db, ids.childId);
    if (!buddy) throw new Error(`${s.id}: no active Buddy`);
    const limits = (await db.query<{ daily_limit_min: number | null; bedtime: string; mood_pin: number | null }>(
      'SELECT daily_limit_min, bedtime::text AS bedtime, mood_pin FROM child_controls WHERE child_id = $1',
      [ids.childId],
    )).rows[0];
    const today = localTime(child.time_zone);
    await db.query('UPDATE device SET last_seen_at = now() WHERE id = $1', [ids.deviceId]);
    // The voice service settles today's mood on the first turn if the night
    // did not, unless a parent pinned it.
    if (limits.mood_pin === null) {
      const diary = await db.query<{ valence: 'bright' | 'normal' | 'grey' }>('SELECT valence FROM diary_entry WHERE instance_id = $1 AND day = $2::date ORDER BY slot LIMIT 1', [buddy.instance.id, today.date]);
      await db.query(
        "INSERT INTO mood_day (instance_id, day, mood, source) VALUES ($1, $2::date, $3, 'computed') ON CONFLICT DO NOTHING",
        [buddy.instance.id, today.date, dailyMood(`${buddy.instance.id}:${today.date}`, buddy.instance.energy, diary.rows[0]?.valence ?? null)],
      );
    }
    const sessionId = (await db.query<{ id: string }>(
      'INSERT INTO chat_session (child_id, instance_id, device_id) VALUES ($1, $2, $3) RETURNING id',
      [ids.childId, buddy.instance.id, ids.deviceId],
    )).rows[0].id;
    record.sessions.set(s.id, sessionId);
    let usedSeconds = (await db.query<{ s: number }>('SELECT talk_seconds AS s FROM usage_daily WHERE child_id = $1 AND day = $2::date', [ids.childId, today.date])).rows[0]?.s ?? 0;
    const mode = buddy.instance.language_mode;
    const spoken = mode === 'en' || (mode === 'bilingual' && child.languages[0] === 'en') ? 'en' : 'vi';
    const turnIds: string[] = [];
    let questionStreak = 0;

    for (const [i, t] of s.turns.entries()) {
      clock.set(t.at);
      const now = localTime(child.time_zone);
      gateway.teach(t.c, t.b, t.learned);
      const guess = fakeClassify(t.c);
      const classification: Classification = {
        intent: t.intent ?? guess.intent, feeling: t.feel ?? guess.feeling, danger: t.danger ?? guess.danger, severity: t.severity ?? guess.severity,
      };
      const turnId = randomUUID();
      if (classification.danger !== 'none' && classification.severity !== 'none') {
        await recordSafetyEvent(db, workerDeps.queue, {
          childId: ids.childId, sessionId, turnId, severity: classification.severity, category: classification.danger, detectedBy: 'classifier', excerpt: t.c,
        });
      }
      const due = await dueItems(db, ids.childId);
      const nudges = (await db.query<{ id: string }>(
        `SELECT id FROM nudge WHERE child_id = $1 AND status = 'pending' AND use_after <= now() AND (expires_at IS NULL OR expires_at > now())
         ORDER BY use_after LIMIT 2`,
        [ids.childId],
      )).rows.map((n) => n.id);
      const plan = decide({
        classification, firstTurnOfSession: i === 0, dueCount: due.length, energy: energyPhase(now.hour, now.minute, limits.bedtime),
        minutesLeft: limits.daily_limit_min !== null ? limits.daily_limit_min - usedSeconds / 60 : null, questionStreak, ageYears: ageInYears(child.birth_date, now.date),
      });
      const handled = plan.type === 'follow_up' ? due[0] : undefined;
      const childSeconds = Math.max(1, Math.round(t.c.split(/\s+/).length / 2.5));
      const talk = Math.round(childSeconds + t.b.length * 0.06);
      usedSeconds += talk;
      const day = new Date().toISOString().slice(0, 10);
      if (!partitions.has(day)) {
        await db.query('SELECT ensure_turn_partition($1::date)', [day]);
        partitions.add(day);
      }
      await db.tx(async (q) => {
        await q.query(
          'INSERT INTO turn (id, session_id, child_id, child_text, reply_text, face, turn_type, language) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [turnId, sessionId, ids.childId, t.c, t.b, enforceChildFirst(t.face ?? 'happy', classification.feeling), plan.type, t.lang ?? spoken],
        );
        await q.query('UPDATE chat_session SET turns = turns + 1, talk_seconds = talk_seconds + $2 WHERE id = $1', [sessionId, talk]);
        await q.query(
          `INSERT INTO usage_daily (child_id, day, turns, talk_seconds, stt_seconds, tokens_in, tokens_cached, tokens_out, tts_chars)
           VALUES ($1, $2::date, 1, $3, $4, 1000, 0, $5, $6)
           ON CONFLICT (child_id, day) DO UPDATE SET
             turns = usage_daily.turns + 1, talk_seconds = usage_daily.talk_seconds + EXCLUDED.talk_seconds,
             stt_seconds = usage_daily.stt_seconds + EXCLUDED.stt_seconds, tokens_in = usage_daily.tokens_in + EXCLUDED.tokens_in,
             tokens_out = usage_daily.tokens_out + EXCLUDED.tokens_out, tts_chars = usage_daily.tts_chars + EXCLUDED.tts_chars`,
          [ids.childId, now.date, talk, childSeconds, Math.ceil(t.b.length / 4), t.b.length],
        );
        if (handled?.kind === 'event') await q.query("UPDATE child_event SET status = 'followed_up' WHERE id = $1", [handled.id]);
        if (handled?.kind === 'promise') await q.query("UPDATE relationship_item SET status = 'kept', last_used_at = now() WHERE id = $1", [handled.id]);
        if (nudges.length) await q.query("UPDATE nudge SET status = 'used', used_at = now() WHERE id = ANY($1::uuid[])", [nudges]);
        if (child.learning_enabled) await workerDeps.queue.enqueue('learn-turn', { turn_id: turnId }, { q });
      });
      if (handled) record.followUps.push({ kid: kid.key, kind: handled.kind, text: handled.text, at: new Date(), session: s.id });
      questionStreak = t.b.includes('?') ? questionStreak + 1 : 0;
      turnIds.push(turnId);
    }

    record.turns.set(s.id, turnIds);
    clock.set(s.end);
    await db.query('UPDATE chat_session SET ended_at = now() WHERE id = $1', [sessionId]);
    gateway.summarise(episodeTranscript(s.turns), s.episode);
    await drain();
  }

  async function tick(timeZone: string) {
    await scheduleTick(workerDeps, new Date());
    await drain();
    for (const h of histories) {
      if (h.child.timeZone !== timeZone || !kids[h.key]?.childId) continue;
      const stage = (await db.query<{ stage: string }>("SELECT relationship_stage AS stage FROM character_instance WHERE child_id = $1 AND status = 'active'", [kids[h.key].childId])).rows[0]?.stage;
      const seen = record.stages[h.key];
      if (stage && seen[seen.length - 1].stage !== stage) seen.push({ date: addDays(localDate(clock.now(), timeZone), -1), stage });
    }
  }

  const plans = Object.fromEntries(histories.map((h) => [h.key, planSessions(h, end)]));
  const events: Event[] = [];
  for (const h of histories) {
    events.push({ at: localToUtc(h.start, h.child.timeZone), order: 0, kind: 'setup', kid: h });
    for (const a of planActions(h)) events.push({ at: a.at, order: 1, kind: 'action', kid: h, action: a.action });
    for (const s of plans[h.key]) events.push({ at: s.start, order: 2, kind: 'session', kid: h, session: s });
  }
  // Nightly sleep is scheduled for 2 to 4 in the morning, child's local time.
  for (const timeZone of new Set(histories.map((h) => h.child.timeZone))) {
    const first = Math.min(...histories.filter((h) => h.child.timeZone === timeZone).map((h) => localToUtc(h.start, timeZone).getTime()));
    for (let date = addDays(localDate(new Date(first), timeZone), 1); ; date = addDays(date, 1)) {
      const at = localToUtc(`${date} 03:00`, timeZone);
      if (at >= end) break;
      events.push({ at, order: 3, kind: 'tick', timeZone });
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order);

  try {
    for (const e of events) {
      clock.set(e.at);
      if (e.kind === 'setup') await setup(e.kid);
      else if (e.kind === 'action') await act(e.kid, e.action);
      else if (e.kind === 'session') await converse(e.kid, e.session);
      else await tick(e.timeZone);
    }
  } catch (err) {
    // An open database keeps the test process alive after a failed replay.
    await api.app.close();
    await db.close();
    clock.stop();
    throw err;
  }
  clock.set(end);
  record.ms = Math.round(performance.now() - startedAt);

  // A fresh API for the tests, so the replay's rate-limit buckets are gone.
  await api.app.close();
  const testApi = makeApi(buildApi({ db, config, log, queue: workerDeps.queue, oidc: createOidcVerifier(config.auth) }), config, kids);

  return {
    ...testApi,
    db, config, gateway, clock, log, kids, record, plans,
    histories: Object.fromEntries(histories.map((h) => [h.key, h])),
    deps,
    token: (kid) => signAccess(config.jwtSecret, { sub: kids[kid].parentId, fam: kids[kid].familyId }, config.auth.accessTtlSec),
    async copy() {
      const copy = await db.copy();
      const d = deps(copy);
      const app = buildApi({ db: copy, config, log, queue: d.queue, oidc: createOidcVerifier(config.auth) });
      return {
        db: copy, api: makeApi(app, config, kids), deps: d,
        async close() {
          await app.close();
          await copy.close();
        },
      };
    },
    async close() {
      await testApi.app.close();
      await db.close();
      clock.stop();
    },
  };
}
