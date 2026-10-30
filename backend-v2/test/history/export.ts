// Writes each child's expanded year as a Markdown transcript, for reading the
// history the tests replay:
//   node test/history/export.ts [out-dir]      (default out/history, gitignored)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { KIDS } from './kids/index.ts';
import { planActions, planSessions } from './plan.ts';
import { localToUtc } from './time.ts';
import type { KidHistory } from './types.ts';

const NAMES: Record<string, string> = { bo: 'Bo', pip: 'Pip', luna: 'Luna' };

function wallClock(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at);
}

function buddyAt(kid: KidHistory, at: Date): string {
  let slug = kid.setup.slug;
  for (const a of kid.parentActions) if (a.do === 'change-buddy' && localToUtc(a.at, kid.child.timeZone) <= at) slug = a.slug;
  return NAMES[slug] ?? slug;
}

function render(kid: KidHistory): string {
  const tz = kid.child.timeZone;
  const speaker = kid.child.nickname ?? kid.child.name;
  const sessions = planSessions(kid);
  const actions = planActions(kid);
  const items = [
    ...sessions.map((s) => ({ at: s.start, text: () => {
      const head = `### ${wallClock(s.start, tz)}${s.story ? ` · ${s.id}` : ''}`;
      const lines = s.turns.map((t) => `**${speaker}:** ${t.c}  \n**${buddyAt(kid, s.start)}:** ${t.b}`);
      return [head, '', lines.join('\n\n'), '', `> ${s.episode.points.join(' · ')}`].join('\n');
    } })),
    ...actions.map((a) => ({ at: a.at, text: () => `*${wallClock(a.at, tz)} · parent: ${JSON.stringify({ ...a.action, at: undefined })}*` })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const out = [
    `# ${kid.child.name}${kid.child.nickname ? ` (${kid.child.nickname})` : ''}: a year with ${NAMES[kid.setup.slug]}`,
    '',
    `Born ${kid.child.birthDate}, ${kid.child.city} (${tz}), speaks ${kid.child.languages.join(' and ')}. Parent: ${kid.parent.name}.`,
    `${sessions.length} sittings, ${sessions.reduce((n, s) => n + s.turns.length, 0)} turns, ${sessions.filter((s) => s.story).length} of them written as story sessions.`,
  ];
  let month = '';
  for (const item of items) {
    const m = wallClock(item.at, tz).slice(0, 7);
    if (m !== month) {
      month = m;
      out.push('', `## ${m}`);
    }
    out.push('', item.text());
  }
  return `${out.join('\n')}\n`;
}

const dir = process.argv[2] ?? 'out/history';
await mkdir(dir, { recursive: true });
for (const kid of KIDS) {
  const file = join(dir, `${kid.key}.md`);
  await writeFile(file, render(kid));
  console.log(`wrote ${file}`);
}
