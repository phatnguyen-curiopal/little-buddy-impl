// The child digest: the always-included summary in every brief. Rebuilt on
// demand and cached briefly, since it changes only when the learner writes.

import type { Queryable } from '../db/index.ts';
import { ageInYears, localTime } from '../character/mood.ts';
import type { ChildDigest } from './types.ts';

export async function buildDigest(q: Queryable, childId: string): Promise<ChildDigest | null> {
  const child = await q.query<{ name: string; nickname: string | null; birth_date: string | null; time_zone: string; topics: string[] | null }>(
    `SELECT c.name, c.nickname, c.birth_date::text AS birth_date, c.time_zone, cc.topics_to_avoid AS topics
     FROM child c LEFT JOIN child_controls cc ON cc.child_id = c.id WHERE c.id = $1`,
    [childId],
  );
  const c = child.rows[0];
  if (!c) return null;

  const facts = await q.query<{ category: string; statement: string }>(
    `SELECT category, statement FROM (
       SELECT category, statement,
              row_number() OVER (PARTITION BY category ORDER BY weight * confidence * ln(mentions + 1) DESC, last_seen_at DESC) AS rn
       FROM fact
       WHERE child_id = $1 AND status = 'active' AND reality = 'real' AND sensitivity = 'normal'
         AND category IN ('passions', 'likes', 'dislikes', 'fears', 'strengths')
     ) f WHERE rn <= 5`,
    [childId],
  );
  const pick = (cat: string, n: number) => facts.rows.filter((f) => f.category === cat).slice(0, n).map((f) => f.statement);

  const people = await q.query<{ name: string; kind: string; relation: string | null }>(
    `SELECT display_name AS name, kind, relation FROM person
     WHERE child_id = $1 AND status = 'active'
     ORDER BY closeness DESC, mentions DESC LIMIT 6`,
    [childId],
  );

  return {
    name: c.name,
    nickname: c.nickname,
    ageYears: ageInYears(c.birth_date, localTime(c.time_zone).date),
    passions: pick('passions', 3),
    likes: pick('likes', 5),
    dislikes: pick('dislikes', 3),
    fears: pick('fears', 3),
    strengths: pick('strengths', 3),
    people: people.rows,
    topicsToAvoid: c.topics ?? [],
  };
}

export function createDigestCache(ttlMs = 5 * 60_000) {
  const cache = new Map<string, { at: number; digest: ChildDigest }>();
  return {
    async get(q: Queryable, childId: string): Promise<ChildDigest | null> {
      const hit = cache.get(childId);
      if (hit && Date.now() - hit.at < ttlMs) return hit.digest;
      const digest = await buildDigest(q, childId);
      if (digest) cache.set(childId, { at: Date.now(), digest });
      return digest;
    },
    invalidate(childId: string) {
      cache.delete(childId);
    },
  };
}

export type DigestCache = ReturnType<typeof createDigestCache>;
