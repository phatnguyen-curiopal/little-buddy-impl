// Checks one or more histories and prints what a year of them amounts to:
//   node test/history/check.ts mai minh lily
// Exits non-zero when a history breaks a rule the replay depends on.

import { historyStats, validateHistory } from './plan.ts';
import type { KidHistory } from './types.ts';

const keys = process.argv.slice(2);
if (!keys.length) {
  console.error('usage: node test/history/check.ts <kid> [<kid>...]');
  process.exit(2);
}

let failed = false;
for (const key of keys) {
  const mod = (await import(`./kids/${key}.ts`)) as Record<string, KidHistory>;
  const kid = mod[key];
  if (!kid) {
    console.error(`${key}: kids/${key}.ts must export const ${key}`);
    failed = true;
    continue;
  }
  const problems = validateHistory(kid);
  const stats = historyStats(kid);
  console.log(`\n${key}: ${stats.sessions} sessions (${stats.story} story) on ${stats.days} days, ${stats.turns} turns, ${stats.first} to ${stats.last}`);
  console.log(`  people: ${stats.people.join(', ')}`);
  console.log(`  distinct fact statements: ${stats.statements}`);
  console.log(`  turns per month: ${Object.entries(stats.perMonth).map(([m, n]) => `${m.slice(2)}:${n}`).join(' ')}`);
  if (problems.length) {
    failed = true;
    console.log(`  ${problems.length} problem(s):`);
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log('  no problems');
  }
}
process.exit(failed ? 1 : 0);
