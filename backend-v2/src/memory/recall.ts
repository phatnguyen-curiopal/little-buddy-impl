// Recall for one turn, inside a hard time budget: whatever has arrived when
// the budget runs out is used, and late results are dropped, never awaited.

import type { Queryable } from '../db/index.ts';
import type { ModelGateway } from '../gateway/types.ts';
import { findMentions, type Mentions, type PersonCard } from './names.ts';
import type { DueItem, RecallItem, RecallResult } from './types.ts';
import { toVectorLiteral } from './vec.ts';

interface Scored {
  id: string;
  text: string;
  distance: number;
  age_days: number;
  strength: number;
  person_id?: string | null;
}

const DAY = 86_400;

function rank(kind: RecallItem['kind'], rows: Scored[]): RecallItem[] {
  return rows.map((r) => {
    const relevance = 1 - Math.min(1, Math.max(0, r.distance));
    const recency = Math.exp(-r.age_days / 30);
    const score = 0.65 * relevance + 0.15 * recency + 0.2 * Math.min(1, r.strength);
    return { kind, id: r.id, text: r.text, score, ...(r.person_id !== undefined && { personId: r.person_id }) };
  });
}

export async function loadPeople(q: Queryable, childId: string): Promise<PersonCard[]> {
  const { rows } = await q.query<PersonCard>(
    `SELECT id, display_name, name_key, aliases, kind, relation, cues, also_word
     FROM person WHERE child_id = $1 AND status = 'active' ORDER BY mentions DESC LIMIT 200`,
    [childId],
  );
  return rows;
}

// An item is due from the start of its day in the child's time zone, never
// earlier: asking how the party went has to wait until the party is over.
export async function dueItems(q: Queryable, childId: string, limit = 3): Promise<DueItem[]> {
  const { rows } = await q.query<{ kind: 'event' | 'promise'; id: string; text: string; due: Date | null }>(
    `SELECT d.kind, d.id, d.text, d.due FROM (
       SELECT 'event' AS kind, id, description AS text, follow_up_due AS due
       FROM child_event
       WHERE child_id = $1 AND status = 'open' AND follow_up_due IS NOT NULL
       UNION ALL
       SELECT 'promise' AS kind, id, content AS text, due_at AS due
       FROM relationship_item
       WHERE child_id = $1 AND kind = 'promise' AND status = 'active' AND due_at IS NOT NULL
     ) d JOIN child c ON c.id = $1
     WHERE (d.due AT TIME ZONE c.time_zone)::date <= (now() AT TIME ZONE c.time_zone)::date
     ORDER BY d.due LIMIT $2`,
    [childId, limit],
  );
  return rows.map((r) => ({ kind: r.kind, id: r.id, text: r.text, due: r.due ? r.due.toISOString() : null }));
}

export async function recall(
  deps: { db: Queryable; gateway: ModelGateway },
  // mentions: already read from the turn's cards (the voice service has them
  // from the tap); without them the cards are loaded here.
  input: { childId: string; instanceId: string; text: string; budgetMs: number; signal?: AbortSignal; mentions?: Mentions<PersonCard> },
): Promise<RecallResult> {
  const { db, gateway } = deps;
  const out: RecallResult = { people: [], memories: [], canon: [], due: [], growth: [], timedOut: false };

  // Only sure mentions: an unsure one waits for the classifier's answer.
  const peopleP = (input.mentions ? Promise.resolve(input.mentions) : loadPeople(db, input.childId).then((cards) => findMentions(cards, input.text))).then((m) => {
    out.people = m.sure.slice(0, 3).map(({ id, display_name, kind, relation }) => ({ id, display_name, kind, relation }));
  });
  const dueP = dueItems(db, input.childId).then((rows) => {
    out.due = rows;
  });
  const vectorP = gateway.embed([input.text], input.signal).then(async ([embedding]) => {
    const vec = toVectorLiteral(embedding);
    const [facts, episodes, items, canon, growth] = await Promise.all([
      db.query<Scored>(
        `SELECT id, statement AS text, (embedding <=> $2) AS distance,
                extract(epoch FROM now() - last_seen_at) / ${DAY} AS age_days, weight * confidence AS strength, person_id
         FROM fact
         WHERE child_id = $1 AND status = 'active' AND sensitivity = 'normal' AND embedding IS NOT NULL
         ORDER BY embedding <=> $2 LIMIT 8`,
        [input.childId, vec],
      ),
      db.query<Scored>(
        // Points are stored as {id, text} so a parent can edit one by id;
        // a bare string point (older rows) is read as it is.
        `SELECT id, array_to_string(ARRAY(
                  SELECT coalesce(p.value->>'text', p.value #>> '{}') FROM jsonb_array_elements(points) WITH ORDINALITY AS p(value, n) ORDER BY p.n
                ), ' ') AS text, (embedding <=> $2) AS distance,
                extract(epoch FROM now() - ended_at) / ${DAY} AS age_days, importance / 5.0 AS strength
         FROM episode
         WHERE child_id = $1 AND embedding IS NOT NULL
         ORDER BY embedding <=> $2 LIMIT 5`,
        [input.childId, vec],
      ),
      db.query<Scored>(
        `SELECT id, content AS text, (embedding <=> $2) AS distance,
                extract(epoch FROM now() - created_at) / ${DAY} AS age_days, 0.8 AS strength
         FROM relationship_item
         WHERE child_id = $1 AND status = 'active' AND kind <> 'promise' AND embedding IS NOT NULL
         ORDER BY embedding <=> $2 LIMIT 5`,
        [input.childId, vec],
      ),
      db.query<Scored>(
        `SELECT id, statement AS text, (embedding <=> $2) AS distance,
                extract(epoch FROM now() - created_at) / ${DAY} AS age_days, 1.0 AS strength
         FROM buddy_canon
         WHERE instance_id = $1 AND status = 'active' AND embedding IS NOT NULL
         ORDER BY embedding <=> $2 LIMIT 4`,
        [input.instanceId, vec],
      ),
      // The growth mirror: an old growing edge or fear, at least three weeks
      // old and not mirrored this month, close to what the child says now.
      db.query<Scored>(
        `SELECT id, statement AS text, (embedding <=> $2) AS distance, 0 AS age_days, 1.0 AS strength
         FROM fact
         WHERE child_id = $1 AND category IN ('growing_edges', 'fears') AND sensitivity = 'normal' AND embedding IS NOT NULL
           AND first_seen_at < now() - interval '21 days' AND (mirrored_at IS NULL OR mirrored_at < now() - interval '30 days')
         ORDER BY embedding <=> $2 LIMIT 1`,
        [input.childId, vec],
      ),
    ]);
    const memories = [...rank('fact', facts.rows), ...rank('episode', episodes.rows), ...rank('relationship', items.rows)];
    // A weak match is worse than none: the model would force it into the reply.
    out.memories = memories.filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 3);
    out.canon = rank('canon', canon.rows).filter((m) => m.score >= 0.45).sort((a, b) => b.score - a.score).slice(0, 2);
    out.growth = growth.rows.filter((g) => g.distance <= 0.6).map((g) => ({ kind: 'fact' as const, id: g.id, text: g.text, score: 1 - g.distance }));
  });

  let timer: NodeJS.Timeout | undefined;
  const budget = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), input.budgetMs);
  });
  const all = Promise.allSettled([peopleP, dueP, vectorP]).then(() => 'done' as const);
  const result = await Promise.race([all, budget]);
  clearTimeout(timer);
  out.timedOut = result === 'timeout';
  return out;
}
