// Nightly sleep, per child, after bedtime: close the day's conversations into
// episodes, let stale facts fade, keep promises honest, move the friendship
// along, and write tomorrow's diary and mood. The weekly digest runs here too.

import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import type { ModelGateway } from '../gateway/types.ts';
import { DIARY_SCHEMA, DIGEST_SCHEMA, EPISODE_CATEGORIES, EPISODE_SCHEMA, type DiaryResult, type DigestResult, type EpisodeResult } from '../gateway/schemas.ts';
import type { Logger } from '../log.ts';
import { dailyMood, localTime } from '../character/mood.ts';
import { activeBuddy } from '../character/packs.ts';
import { updateTraits } from '../memory/traits.ts';
import { toVectorLiteral } from '../memory/vec.ts';
import type { Queue } from './queue.ts';

export interface WorkerDeps {
  db: Db;
  gateway: ModelGateway;
  config: Config;
  log: Logger;
  queue: Queue;
}

const EPISODE_SYSTEM = [
  'You summarise one conversation between a child aged 4 to 8 and their toy friend, for the toy\'s memory. Return only the JSON.',
  'points: 1 to 5 short points about what happened, in the language of the conversation. feelings: the child\'s feelings (1 to 3 words).',
  'open_threads: anything unfinished the toy could ask about next time. importance: 1 (small talk) to 5 (big news or strong feelings).',
].join('\n');

const DIARY_SYSTEM = [
  'You write tomorrow\'s diary for a toy friend character, 1 to 3 tiny events, each one sentence, in the language given.',
  'Follow the plausible-life rule strictly: everything happens where the character really is (the toy, the child\'s home, the',
  'window, its dreams and imagination). It never goes outside, eats, or meets people in person. Nothing scary.',
  'An event may react kindly to what the child shared today. Keep its past canon consistent. canon: new facts about itself',
  'that these entries establish (for example a new favourite), else an empty list. valence: bright, normal or grey (mildly glum).',
].join('\n');

const DIGEST_SYSTEM = [
  'You write a weekly digest for a parent about their child\'s week with a toy friend. Return only the JSON.',
  'Use only the material given. Never quote the child\'s words; describe themes. Keep each item short and kind.',
  'highlights: 2 to 4 moments. new_interests: new things the child loves. mood_trend: one short phrase. people: who came up most.',
  'conversation_starters: 2 to 3 questions the parent could ask at dinner.',
].join('\n');

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function summariseEpisodes(deps: WorkerDeps, childId: string): Promise<number> {
  const { db, gateway } = deps;
  // An episode is memory about the child, so like the learner it needs
  // consent: learning on now, and already on when the talk began.
  const sessions = await db.query<{ id: string; started_at: Date; ended_at: Date | null }>(
    `SELECT s.id, s.started_at, s.ended_at FROM chat_session s JOIN child c ON c.id = s.child_id
     WHERE s.child_id = $1 AND c.learning_enabled AND s.started_at >= coalesce(c.learning_since, '-infinity')
       AND s.turns > 0 AND s.started_at > now() - interval '3 days'
       AND (s.ended_at IS NOT NULL OR s.started_at < now() - interval '2 hours')
       AND NOT EXISTS (SELECT 1 FROM episode e WHERE e.session_id = s.id)`,
    [childId],
  );
  let made = 0;
  for (const s of sessions.rows) {
    const turns = await db.query<{ child_text: string; reply_text: string; created_at: Date }>(
      'SELECT child_text, reply_text, created_at FROM turn WHERE session_id = $1 ORDER BY created_at',
      [s.id],
    );
    if (!turns.rows.length) continue;
    const transcript = turns.rows.map((t) => `Child: ${t.child_text}\nBuddy: ${t.reply_text}`).join('\n').slice(0, 12_000);
    const ep = await gateway.structured<EpisodeResult>({ tier: 'background', name: 'episode', schema: EPISODE_SCHEMA, system: EPISODE_SYSTEM, user: transcript });
    const points = (ep.points ?? []).map((p, i) => ({ id: i + 1, text: String(p).slice(0, 200) })).slice(0, 5);
    if (!points.length) continue;
    const [vec] = await gateway.embed([points.map((p) => p.text).join(' ')]);
    const category = (EPISODE_CATEGORIES as readonly string[]).includes(ep.category) ? ep.category : 'other';
    await db.query(
      `INSERT INTO episode (child_id, session_id, started_at, ended_at, points, feelings, open_threads, category, importance, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
      [
        childId, s.id, s.started_at, s.ended_at ?? turns.rows[turns.rows.length - 1].created_at,
        JSON.stringify(points), (ep.feelings ?? []).slice(0, 3), JSON.stringify((ep.open_threads ?? []).slice(0, 3)),
        category, Math.min(5, Math.max(1, Math.round(ep.importance || 1))), toVectorLiteral(vec),
      ],
    );
    made += 1;
  }
  return made;
}

// Facts typed by a parent or seeded by the questionnaire arrive without an
// embedding (the API has no model access); they become searchable here.
async function backfillEmbeddings(deps: WorkerDeps, childId: string): Promise<void> {
  const { db, gateway } = deps;
  const facts = await db.query<{ id: string; statement: string }>(
    "SELECT id, statement FROM fact WHERE child_id = $1 AND status = 'active' AND embedding IS NULL LIMIT 100",
    [childId],
  );
  const people = await db.query<{ id: string; label: string }>(
    "SELECT id, display_name || ' ' || coalesce(relation, kind) AS label FROM person WHERE child_id = $1 AND embedding IS NULL LIMIT 100",
    [childId],
  );
  const texts = [...facts.rows.map((f) => f.statement), ...people.rows.map((p) => p.label)];
  if (!texts.length) return;
  const vecs = await gateway.embed(texts);
  for (const [i, f] of facts.rows.entries()) await db.query('UPDATE fact SET embedding = $2 WHERE id = $1', [f.id, toVectorLiteral(vecs[i])]);
  for (const [i, p] of people.rows.entries()) await db.query('UPDATE person SET embedding = $2 WHERE id = $1', [p.id, toVectorLiteral(vecs[facts.rows.length + i])]);
}

export async function nightlySleep(deps: WorkerDeps, childId: string, day: string): Promise<void> {
  const { db, gateway, queue, log } = deps;
  const child = (await db.query<{ time_zone: string; learning_enabled: boolean }>('SELECT time_zone, learning_enabled FROM child WHERE id = $1', [childId])).rows[0];
  if (!child) return;
  await db.query(
    "INSERT INTO nightly_run (child_id, day, status) VALUES ($1, $2::date, 'queued') ON CONFLICT (child_id, day) DO UPDATE SET status = 'queued', started_at = now()",
    [childId, day],
  );

  const episodes = await summariseEpisodes(deps, childId);
  await backfillEmbeddings(deps, childId);
  // Temperament from today's summaries, by consent only, like every memory.
  if (child.learning_enabled) {
    await updateTraits({ db, gateway }, childId).catch((err) => log.warn('trait update failed', { child_id: childId, error: (err as Error).message }));
  }

  // Facts fade in recall but are never deleted for age; promises and events
  // that slipped past are closed so Buddy does not ask about them forever.
  await db.query("UPDATE fact SET weight = greatest(0.2, weight * 0.97) WHERE child_id = $1 AND status = 'active' AND last_seen_at < now() - interval '14 days'", [childId]);
  await db.query("UPDATE relationship_item SET status = 'expired' WHERE child_id = $1 AND kind = 'promise' AND status = 'active' AND due_at < now() - interval '3 days'", [childId]);
  await db.query("UPDATE child_event SET status = 'done' WHERE child_id = $1 AND status = 'open' AND follow_up_due < now() - interval '3 days'", [childId]);

  const buddy = await activeBuddy(db, childId);
  if (buddy) {
    const { instance, pack } = buddy;
    const days = await db.query<{ n: number }>(
      'SELECT count(DISTINCT started_at::date)::int AS n FROM chat_session WHERE child_id = $1 AND instance_id = $2',
      [childId, instance.id],
    );
    const active = days.rows[0].n;
    const stage = active >= 25 ? 'best_friends' : active >= 5 ? 'buddies' : 'meeting';
    if (stage !== instance.relationship_stage) await db.query('UPDATE character_instance SET relationship_stage = $2 WHERE id = $1', [instance.id, stage]);

    const tomorrow = addDays(day, 1);
    const hasDiary = await db.query('SELECT 1 FROM diary_entry WHERE instance_id = $1 AND day = $2::date', [instance.id, tomorrow]);
    let valence: 'bright' | 'normal' | 'grey' | null = null;
    if (!hasDiary.rowCount) {
      const canon = await db.query<{ statement: string }>("SELECT statement FROM buddy_canon WHERE instance_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 10", [instance.id]);
      const todayPoints = await db.query<{ points: { text: string }[] }>("SELECT points FROM episode WHERE child_id = $1 AND ended_at > now() - interval '1 day'", [childId]);
      const language = instance.language_mode === 'en' ? 'English' : 'Vietnamese';
      const diary = await gateway.structured<DiaryResult>({
        tier: 'background', name: 'diary', schema: DIARY_SCHEMA, system: DIARY_SYSTEM,
        user: [
          `Character: ${pack.name}, ${pack.bible.who}. Lives ${pack.lifeRules.lives}. Favourites: ${pack.bible.favourites.join(', ')}. Learning: ${pack.bible.is_learning.join(', ')}.`,
          `Language: ${language}. Date: ${tomorrow}.`,
          `Past canon: ${canon.rows.map((c) => c.statement).join('; ') || 'none'}`,
          `What the child shared today: ${todayPoints.rows.flatMap((r) => r.points.map((p) => p.text)).join('; ') || 'nothing yet'}`,
        ].join('\n'),
      });
      const entries = (diary.entries ?? []).slice(0, 3);
      for (const [i, e] of entries.entries()) {
        await db.query(
          'INSERT INTO diary_entry (instance_id, day, slot, story, valence) VALUES ($1, $2::date, $3, $4, $5) ON CONFLICT DO NOTHING',
          [instance.id, tomorrow, i + 1, String(e.story).slice(0, 300), ['bright', 'normal', 'grey'].includes(e.valence) ? e.valence : 'normal'],
        );
      }
      valence = entries[0]?.valence ?? null;
      const newCanon = (diary.canon ?? []).slice(0, 3);
      if (newCanon.length) {
        const vecs = await gateway.embed(newCanon.map((c) => c.statement));
        for (const [i, c] of newCanon.entries()) {
          await db.query("INSERT INTO buddy_canon (instance_id, statement, topic, source, embedding) VALUES ($1, $2, $3, 'diary', $4)", [instance.id, c.statement.slice(0, 200), c.topic, toVectorLiteral(vecs[i])]);
        }
      }
    }
    const pinned = await db.query<{ mood_pin: number | null }>('SELECT mood_pin FROM child_controls WHERE child_id = $1', [childId]);
    if (pinned.rows[0]?.mood_pin == null) {
      await db.query(
        "INSERT INTO mood_day (instance_id, day, mood, source) VALUES ($1, $2::date, $3, 'computed') ON CONFLICT DO NOTHING",
        [instance.id, tomorrow, dailyMood(`${instance.id}:${tomorrow}`, instance.energy, valence)],
      );
    }
  }

  const local = localTime(child.time_zone);
  if (local.weekday === 'Sunday') {
    await queue.enqueue('build-digest', { child_id: childId, week_start: addDays(day, -6) }, { dedupeKey: `${childId}:${addDays(day, -6)}` });
  }
  await db.query("UPDATE nightly_run SET status = 'done', finished_at = now() WHERE child_id = $1 AND day = $2::date", [childId, day]);
  log.info('nightly sleep done', { child_id: childId, day, episodes });
}

export async function buildWeeklyDigest(deps: WorkerDeps, childId: string, weekStart: string): Promise<string | null> {
  const { db, gateway } = deps;
  const exists = await db.query('SELECT 1 FROM digest WHERE child_id = $1 AND week_start = $2::date', [childId, weekStart]);
  if (exists.rowCount) return null;
  const end = addDays(weekStart, 7);
  const [episodes, facts, people, usage] = await Promise.all([
    db.query<{ points: { text: string }[]; feelings: string[] }>('SELECT points, feelings FROM episode WHERE child_id = $1 AND ended_at >= $2::date AND ended_at < $3::date', [childId, weekStart, end]),
    db.query<{ statement: string }>("SELECT statement FROM fact WHERE child_id = $1 AND sensitivity = 'normal' AND first_seen_at >= $2::date AND first_seen_at < $3::date", [childId, weekStart, end]),
    db.query<{ display_name: string }>('SELECT display_name FROM person WHERE child_id = $1 AND last_mentioned_at >= $2::date ORDER BY mentions DESC LIMIT 5', [childId, weekStart]),
    db.query<{ turns: number; minutes: number }>('SELECT coalesce(sum(turns), 0)::int AS turns, coalesce(sum(talk_seconds), 0)::int / 60 AS minutes FROM usage_daily WHERE child_id = $1 AND day >= $2::date AND day < $3::date', [childId, weekStart, end]),
  ]);
  const content = await gateway.structured<DigestResult>({
    tier: 'background', name: 'digest', schema: DIGEST_SCHEMA, system: DIGEST_SYSTEM,
    user: [
      `Episodes: ${episodes.rows.flatMap((e) => e.points.map((p) => p.text)).join('; ') || 'none'}`,
      `Feelings: ${episodes.rows.flatMap((e) => e.feelings).join(', ') || 'none'}`,
      `New things Buddy learned: ${facts.rows.map((f) => f.statement).join('; ') || 'none'}`,
      `People mentioned: ${people.rows.map((p) => p.display_name).join(', ') || 'none'}`,
    ].join('\n'),
  });
  // Growth (an old difficulty replaced by a strength) and the week's new
  // words come straight from memory, not from the model.
  const [growth, words] = await Promise.all([
    db.query<{ before: string; after: string }>(
      `SELECT o.statement AS before, n.statement AS after FROM fact o JOIN fact n ON n.id = o.superseded_by
       WHERE o.child_id = $1 AND o.category IN ('growing_edges', 'fears') AND n.first_seen_at >= $2::date AND n.first_seen_at < $3::date`,
      [childId, weekStart, end],
    ),
    db.query<{ word: string; meaning: string | null; used: number }>(
      'SELECT word, meaning, used FROM word_bank WHERE child_id = $1 AND first_seen_at >= $2::date AND first_seen_at < $3::date ORDER BY first_seen_at',
      [childId, weekStart, end],
    ),
  ]);
  const body = { ...content, growth: growth.rows, words: words.rows, turns: usage.rows[0].turns, minutes: usage.rows[0].minutes };
  const r = await db.query<{ id: string }>(
    'INSERT INTO digest (child_id, week_start, content) VALUES ($1, $2::date, $3) ON CONFLICT DO NOTHING RETURNING id',
    [childId, weekStart, JSON.stringify(body)],
  );
  const id = r.rows[0]?.id ?? null;
  if (id) {
    await db.query(
      `INSERT INTO notification (parent_id, child_id, kind, ref_id)
       SELECT p.id, c.id, 'digest', $2 FROM child c JOIN parent_user p ON p.family_id = c.family_id WHERE c.id = $1`,
      [childId, id],
    );
  }
  return id;
}
