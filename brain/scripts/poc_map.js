// Pure mapping from the prototype's single-child schema (LittleBuddy/app-b,
// memory.js) to the brain's subject-scoped one. Kept apart from the script
// so the rules are unit-tested without a prototype database.

import { EMBED_DIMS } from '../memory/embed.js';
import { toCode } from '../memory/enums.js';

// The prototype backfilled missing conversation ids by silence gaps:
// exchanges of one conversation sit seconds apart, a 3-minute hole means
// the story moved on.
export const CONVERSATION_GAP_MS = 3 * 60_000;

export function clusterConversations(rows, tag, gapMs = CONVERSATION_GAP_MS) {
  const loose = rows
    .filter((row) => !row.conversation_id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || Number(a.id) - Number(b.id));
  const assigned = new Map();
  let group = 0;
  let last = null;
  for (const row of loose) {
    const at = new Date(row.created_at).getTime();
    if (last === null || at - last > gapMs) group += 1;
    assigned.set(String(row.id), `bf${tag}-${group}`);
    last = at;
  }
  return assigned;
}

// pgvector's text form is a JSON array.
export function parseVector(text) {
  if (text === null || text === undefined) return null;
  const vec = JSON.parse(text);
  if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
    throw new Error(`expected a ${EMBED_DIMS}-dimension vector, got ${Array.isArray(vec) ? vec.length : typeof vec}`);
  }
  return vec;
}

export function mapExchange(row, conversationIds) {
  return {
    conversationId: row.conversation_id || conversationIds.get(String(row.id)),
    userText: row.user_text,
    assistantText: row.assistant_text,
    embedding: parseVector(row.embedding),
    createdAt: row.created_at,
  };
}

export function mapName(row) {
  return {
    name: String(row.name).toLowerCase(),
    display: row.display,
    kind: toCode('nameKind', row.kind) || 'other',
    count: Number(row.count) || 1,
    last_heard: row.last_heard,
    // Note ids ("conv") are kept as they are, so they still match the
    // imported exchanges and summaries.
    contexts: Array.isArray(row.contexts) ? row.contexts : [],
    age: row.age ?? null,
    relation: row.relation ?? null,
    species: row.species ?? null,
  };
}

// Returns null for a category the brain does not have (the prototype's
// retired 'sự kiện'), which the script skips and counts.
export function mapFact(row) {
  const category = toCode('factCategory', row.category);
  if (!category) return null;
  return {
    category,
    fact: row.fact,
    count: Number(row.count) || 1,
    first_heard: row.first_heard,
    last_heard: row.last_heard,
    embedding: parseVector(row.embedding),
  };
}

export function mapSummary(row) {
  const points = Array.isArray(row.points) ? row.points : [];
  return {
    conversation_id: row.conversation_id,
    points,
    next_id: Number(row.next_id) || points.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1,
    category: toCode('summaryCategory', row.category),
    created_at: row.created_at,
    updated_at: row.updated_at,
    embedding: parseVector(row.embedding),
  };
}
