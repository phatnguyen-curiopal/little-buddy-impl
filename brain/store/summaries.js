import { vectorLiteral } from './db.js';

export async function get(q, subject, conversationId) {
  const { rows } = await q.query(
    `SELECT conversation_id, points, next_id, category, updated_at
       FROM conversation_summaries WHERE subject = $1 AND conversation_id = $2`,
    [subject, conversationId],
  );
  return rows[0] || null;
}

export async function save(q, subject, { conversationId, points, nextId, category, embedding }) {
  await q.query(
    `INSERT INTO conversation_summaries (subject, conversation_id, points, next_id, category, embedding)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6::vector)
     ON CONFLICT (subject, conversation_id) DO UPDATE SET
       points = EXCLUDED.points,
       next_id = EXCLUDED.next_id,
       -- A turn that changed only the points keeps the category decided earlier.
       category = COALESCE(EXCLUDED.category, conversation_summaries.category),
       embedding = EXCLUDED.embedding,
       updated_at = now()`,
    [subject, conversationId, JSON.stringify(points), nextId, category, vectorLiteral(embedding)],
  );
}

// Ordered by time only: this is the one retrieval path that does not ask
// what resembles the question, which is how an unfinished promise surfaces.
export async function recent(q, subject, excludeConversationId, limit) {
  const { rows } = await q.query(
    `SELECT conversation_id, points, category, updated_at
       FROM conversation_summaries
      WHERE subject = $1 AND conversation_id IS DISTINCT FROM $2
      ORDER BY updated_at DESC
      LIMIT $3`,
    [subject, excludeConversationId, limit],
  );
  return rows;
}

export async function search(q, subject, vec, excludeConversationId, limit) {
  const { rows } = await q.query(
    `SELECT conversation_id, points, category, updated_at,
            1 - (embedding <=> $2::vector) AS score
       FROM conversation_summaries
      WHERE subject = $1 AND embedding IS NOT NULL AND conversation_id IS DISTINCT FROM $3
      ORDER BY embedding <=> $2::vector
      LIMIT $4`,
    [subject, vectorLiteral(vec), excludeConversationId, limit],
  );
  return rows;
}

export async function insertRaw(q, subject, row) {
  await q.query(
    `INSERT INTO conversation_summaries
       (subject, conversation_id, points, next_id, category, created_at, updated_at, embedding)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::vector)`,
    [subject, row.conversation_id, JSON.stringify(row.points ?? []), row.next_id, row.category,
      row.created_at, row.updated_at, vectorLiteral(row.embedding)],
  );
}
