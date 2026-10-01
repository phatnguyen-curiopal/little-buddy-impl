import { vectorLiteral } from './db.js';

// Every query filters by subject first: one child's words must never be a
// search result for another.

export async function insert(q, { subject, conversationId, userText, assistantText, embedding, createdAt = null }) {
  await q.query(
    `INSERT INTO exchanges (subject, conversation_id, user_text, assistant_text, embedding, created_at)
     VALUES ($1, $2, $3, $4, $5::vector, COALESCE($6, now()))`,
    [subject, conversationId, userText, assistantText, vectorLiteral(embedding), createdAt],
  );
}

export async function search(q, subject, vec, limit) {
  const { rows } = await q.query(
    `SELECT user_text, assistant_text, created_at, conversation_id,
            1 - (embedding <=> $2::vector) AS score
       FROM exchanges
      WHERE subject = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
    [subject, vectorLiteral(vec), limit],
  );
  return rows;
}

// One conversation in speech order, each exchange scored against the current
// question so the loose context floor can drop a different thread.
export async function conversation(q, subject, conversationId, vec, limit) {
  const { rows } = await q.query(
    `SELECT user_text, assistant_text, created_at, conversation_id,
            1 - (embedding <=> $3::vector) AS score
       FROM exchanges
      WHERE subject = $1 AND conversation_id = $2
      ORDER BY created_at ASC
      LIMIT $4`,
    [subject, conversationId, vectorLiteral(vec), limit],
  );
  return rows;
}

export async function nearestScore(q, subject, vec) {
  const { rows } = await q.query(
    `SELECT 1 - (embedding <=> $2::vector) AS score
       FROM exchanges
      WHERE subject = $1
      ORDER BY embedding <=> $2::vector
      LIMIT 1`,
    [subject, vectorLiteral(vec)],
  );
  return rows[0] ? Number(rows[0].score) : null;
}
