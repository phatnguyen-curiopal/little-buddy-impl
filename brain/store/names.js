export async function all(q, subject) {
  const { rows } = await q.query(
    `SELECT display, kind, count, last_heard, contexts, age, relation, species
       FROM familiar_names
      WHERE subject = $1
      ORDER BY count DESC, last_heard DESC`,
    [subject],
  );
  return rows;
}

export async function contextsOf(q, subject, key) {
  const { rows } = await q.query(
    'SELECT contexts FROM familiar_names WHERE subject = $1 AND name = $2',
    [subject, key],
  );
  return rows[0]?.contexts ?? [];
}

// A turn that mentions a name without saying its age must leave a learned
// age alone, while a new value wins: children correct themselves. A kind of
// 'other' never overwrites a real one for the same reason.
export async function upsert(q, subject, { key, display, kind, contexts, age, relation, species }) {
  await q.query(
    `INSERT INTO familiar_names (subject, name, display, kind, contexts, age, relation, species)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
     ON CONFLICT (subject, name) DO UPDATE SET
       count = familiar_names.count + 1,
       last_heard = now(),
       kind = CASE WHEN EXCLUDED.kind <> 'other' THEN EXCLUDED.kind ELSE familiar_names.kind END,
       contexts = EXCLUDED.contexts,
       age = COALESCE(EXCLUDED.age, familiar_names.age),
       relation = COALESCE(EXCLUDED.relation, familiar_names.relation),
       species = COALESCE(EXCLUDED.species, familiar_names.species)`,
    [subject, key, display, kind, JSON.stringify(contexts), age, relation, species],
  );
}

// Import path: rows arrive whole, counts and dates included.
export async function insertRaw(q, subject, row) {
  await q.query(
    `INSERT INTO familiar_names (subject, name, display, kind, count, last_heard, contexts, age, relation, species)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)`,
    [subject, row.name, row.display, row.kind, row.count, row.last_heard, JSON.stringify(row.contexts ?? []),
      row.age ?? null, row.relation ?? null, row.species ?? null],
  );
}
