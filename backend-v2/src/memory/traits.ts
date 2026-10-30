// Temperament learned slowly. Each night the day's conversation summaries
// may show a lasting trait; a trait shapes how Buddy talks only after 3 or
// more nights across about two weeks point the same way (product spec, rules
// for knowing the child), and it is guidance, never a label said to the child.

import type { Queryable } from '../db/index.ts';
import { TRAITS, TRAITS_SCHEMA, type Trait, type TraitsResult } from '../gateway/schemas.ts';
import type { ModelGateway } from '../gateway/types.ts';

export { TRAITS, type Trait };

export interface TraitRow {
  name: string;
  value: number;
  confidence: number;
  observations: number;
  first_observed_at: Date;
  last_observed_at: Date;
}

const DAY_MS = 86_400_000;

const TRAITS_SYSTEM = [
  'You look for lasting temperament in one child aged 4 to 8, from summaries of today\'s chats with their toy friend. Return only the JSON.',
  'Rate only traits today\'s material clearly shows; an empty list is normal. value from -1 to 1:',
  'outgoing (+ chatty, shares freely; - reserved, warms up slowly), cautious (+ worried by new or surprising things; - bold),',
  'sensitive (+ feels things deeply, upset easily; - shrugs things off), persistent (+ keeps trying; - gives up quickly),',
  'curious (+ asks how and why; - prefers the familiar). evidence: a few words of your own, never the child\'s words.',
].join('\n');

const GUIDANCE: Record<Trait, [string, string]> = {
  outgoing: ['They warm up slowly: give them time, ask easy questions and never push.', 'They love to chat and share: match their energy.'],
  cautious: ['They love bold adventures: invite them to try new things.', 'New or surprising things can worry them: go gently, and no startle games.'],
  sensitive: ['Little upsets roll off them: light teasing is fine.', 'They feel things deeply: name feelings softly and never tease.'],
  persistent: ['They get discouraged quickly: celebrate small steps and make trying again easy.', 'They keep at things: praise their effort and practice.'],
  curious: ['They like familiar things: build on what they already know.', 'They love asking how and why: offer one surprising thing.'],
};

const spanDays = (t: Pick<TraitRow, 'first_observed_at' | 'last_observed_at'>) =>
  (t.last_observed_at.getTime() - t.first_observed_at.getTime()) / DAY_MS;

// 13 rather than 14 days: nightly runs drift by minutes, and three nights a
// week apart must count as two weeks.
export function isUsable(t: TraitRow): boolean {
  return t.observations >= 3 && spanDays(t) >= 13 && Math.abs(t.value) >= 0.3;
}

export function traitConfidence(observations: number, days: number, value: number): number {
  const c = Math.min(1, observations / 6) * Math.min(1, days / 14) * Math.min(1, Math.abs(value) / 0.6);
  return Math.round(c * 100) / 100;
}

export function traitGuidance(rows: TraitRow[]): string[] {
  return rows.filter(isUsable).flatMap((t) => (t.name in GUIDANCE ? [GUIDANCE[t.name as Trait][t.value > 0 ? 1 : 0]] : []));
}

// A cautious or sensitive child gets no startle games, whatever the setting.
export function startlesWelcome(rows: TraitRow[]): boolean {
  return !rows.some((t) => isUsable(t) && t.value > 0 && (t.name === 'cautious' || t.name === 'sensitive'));
}

export async function loadTraits(q: Queryable, childId: string): Promise<TraitRow[]> {
  return (await q.query<TraitRow>('SELECT name, value, confidence, observations, first_observed_at, last_observed_at FROM trait WHERE child_id = $1', [childId])).rows;
}

// One night's evidence, folded in as a running mean. A trait already counted
// in the last 20 hours is skipped, so a re-run night counts once.
export async function updateTraits(deps: { db: Queryable; gateway: ModelGateway }, childId: string): Promise<number> {
  const { db, gateway } = deps;
  const today = await db.query<{ points: { text: string }[]; feelings: string[] }>(
    "SELECT points, feelings FROM episode WHERE child_id = $1 AND ended_at > now() - interval '1 day'",
    [childId],
  );
  if (!today.rows.length) return 0;
  const material = today.rows
    .map((e) => `${e.points.map((p) => (typeof p === 'string' ? p : p.text)).join('; ')} (feelings: ${e.feelings.join(', ') || 'none'})`)
    .join('\n');
  const result = await gateway.structured<TraitsResult>({ tier: 'background', name: 'traits', schema: TRAITS_SCHEMA, system: TRAITS_SYSTEM, user: material });
  const existing = new Map((await loadTraits(db, childId)).map((t) => [t.name, t]));
  let n = 0;
  for (const seen of result.traits ?? []) {
    if (!(TRAITS as readonly string[]).includes(seen.name) || !Number.isFinite(seen.value)) continue;
    const v = Math.max(-1, Math.min(1, seen.value));
    const old = existing.get(seen.name);
    if (old && Date.now() - old.last_observed_at.getTime() < 20 * 3_600_000) continue;
    const observations = (old?.observations ?? 0) + 1;
    const value = old ? (old.value * old.observations + v) / observations : v;
    const days = old ? (Date.now() - old.first_observed_at.getTime()) / DAY_MS : 0;
    await db.query(
      `INSERT INTO trait (child_id, name, value, confidence, observations) VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (child_id, name) DO UPDATE SET value = $3, confidence = $4, observations = trait.observations + 1, last_observed_at = now()`,
      [childId, seen.name, value, traitConfidence(observations, days, value)],
    );
    n += 1;
  }
  return n;
}
