// Everything the brain remembers about one subject, in one transaction.
// Moods are Buddy's (per toy), not the child's, so they stay.
export async function wipe(q, subject) {
  const counts = {};
  for (const table of ['exchanges', 'familiar_names', 'child_facts', 'conversation_summaries']) {
    const { rowCount } = await q.query(`DELETE FROM ${table} WHERE subject = $1`, [subject]);
    counts[table] = rowCount;
  }
  return counts;
}
