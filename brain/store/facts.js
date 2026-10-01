import { vectorLiteral } from './db.js';

// The extractor's view of the sheet: every fact, newest first, with ids it
// may address.
export async function all(q, subject) {
  const { rows } = await q.query(
    `SELECT id, category, fact, count, last_heard
       FROM child_facts WHERE subject = $1
      ORDER BY last_heard DESC`,
    [subject],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export async function recent(q, subject, limit) {
  const { rows } = await q.query(
    `SELECT id, category, fact, count, last_heard
       FROM child_facts WHERE subject = $1
      ORDER BY last_heard DESC LIMIT $2`,
    [subject, limit],
  );
  return rows;
}

// Relevance first, recency to fill: facts scoring above the loose floor come
// first (best first), then the rest by last_heard. A fact whose vector has
// not landed competes on recency alone.
export async function ranked(q, subject, vec, limit, floor) {
  const { rows } = await q.query(
    `SELECT id, category, fact, count, last_heard, score FROM (
       SELECT id, category, fact, count, last_heard,
              CASE WHEN embedding IS NULL THEN -1 ELSE 1 - (embedding <=> $2::vector) END AS score
         FROM child_facts WHERE subject = $1
     ) t
     ORDER BY (score >= $3) DESC,
              CASE WHEN score >= $3 THEN score END DESC,
              last_heard DESC
     LIMIT $4`,
    [subject, vectorLiteral(vec), floor, limit],
  );
  return rows;
}

// An `add` for a fact already on file bumps it instead of duplicating it.
export async function add(q, subject, category, fact) {
  const { rows } = await q.query(
    `INSERT INTO child_facts (subject, category, fact) VALUES ($1, $2, $3)
     ON CONFLICT (subject, category, lower(fact)) DO UPDATE SET
       count = child_facts.count + 1, last_heard = now()
     RETURNING id`,
    [subject, category, fact],
  );
  return Number(rows[0].id);
}

export async function bump(q, subject, id) {
  await q.query(
    'UPDATE child_facts SET count = count + 1, last_heard = now() WHERE subject = $1 AND id = $2',
    [subject, id],
  );
}

export async function update(q, subject, id, fact) {
  await q.query(
    'UPDATE child_facts SET fact = $3, last_heard = now(), embedding = NULL WHERE subject = $1 AND id = $2',
    [subject, id, fact],
  );
}

export async function drop(q, subject, id) {
  await q.query('DELETE FROM child_facts WHERE subject = $1 AND id = $2', [subject, id]);
}

export async function setEmbedding(q, subject, id, vec) {
  await q.query(
    'UPDATE child_facts SET embedding = $3::vector WHERE subject = $1 AND id = $2',
    [subject, id, vectorLiteral(vec)],
  );
}

export async function insertRaw(q, subject, row) {
  await q.query(
    `INSERT INTO child_facts (subject, category, fact, count, first_heard, last_heard, embedding)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
     ON CONFLICT (subject, category, lower(fact)) DO NOTHING`,
    [subject, row.category, row.fact, row.count, row.first_heard, row.last_heard, vectorLiteral(row.embedding)],
  );
}
