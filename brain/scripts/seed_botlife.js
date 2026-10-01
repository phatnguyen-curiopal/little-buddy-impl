// Seeds Buddy's own life: backstories (vi + en) and the hand-written diary,
// dated relative to today in Vietnam time, so "yesterday" always has a page
// and the mood dice always find a fresh one.
//
//   npm run seed:botlife                                  add (per page: do nothing if present)
//   npm run seed:botlife -- --wipe                        start every diary over
//   npm run seed:botlife -- --only friend --wipe --reset-profile   redo one role, backstory too
//
// A re-run on a later day writes new rows for the shifted dates; --wipe
// resets cleanly.

import { pathToFileURL } from 'node:url';

import { loadConfig } from '../config.js';
import { addDays, dayKey } from '../persona/botlife.js';
import { BACKSTORIES, DIARY } from '../persona/botlife_seed.js';
import * as botlifeStore from '../store/botlife.js';
import { createPool } from '../store/db.js';

export const ROLES = ['friend', 'daddy', 'mommy', 'teacher'];
const VALENCES = new Set(['bright', 'normal', 'grey']);

// Checked before touching the database: valences must pass the CHECK and
// each (role, day) may appear once.
export function checkDiary(diary = DIARY) {
  for (const [role, entries] of Object.entries(diary)) {
    const days = new Set();
    for (const entry of entries) {
      if (!VALENCES.has(entry.valence)) throw new Error(`${role}: unknown valence "${entry.valence}"`);
      if (days.has(entry.daysAgo)) throw new Error(`${role}: two pages with daysAgo=${entry.daysAgo}`);
      if (!entry.vi || !entry.en) throw new Error(`${role}: page ${entry.daysAgo} needs vi and en`);
      days.add(entry.daysAgo);
    }
  }
}

export function diaryRows(role, today) {
  return DIARY[role].flatMap((entry) =>
    ['vi', 'en'].map((lang) => ({ role, lang, day: addDays(today, -entry.daysAgo), story: entry[lang], valence: entry.valence })),
  );
}

export async function seedBotLife(pool, { only = '', wipe = false, resetProfile = false, today = dayKey() } = {}) {
  checkDiary();
  if (only && !ROLES.includes(only)) throw new Error(`--only "${only}" is not one of ${ROLES.join(', ')}`);
  const targets = only ? [only] : ROLES;
  const report = { backstories: 0, wiped: 0, added: 0, skipped: 0 };
  for (const role of ROLES) {
    for (const lang of ['vi', 'en']) {
      report.backstories += await botlifeStore.upsertBackstory(pool, role, lang, BACKSTORIES[lang][role], {
        overwrite: resetProfile && targets.includes(role),
      });
    }
  }
  if (wipe) report.wiped = await botlifeStore.wipeDiary(pool, targets);
  for (const role of targets) {
    for (const row of diaryRows(role, today)) {
      if (await botlifeStore.insertDiary(pool, row)) report.added += 1;
      else report.skipped += 1;
    }
  }
  return report;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const onlyAt = args.indexOf('--only');
  const config = loadConfig();
  const pool = createPool(config.databaseUrl, { max: 2 });
  try {
    const report = await seedBotLife(pool, {
      only: onlyAt > -1 ? String(args[onlyAt + 1] || '').trim() : '',
      wipe: args.includes('--wipe'),
      resetProfile: args.includes('--reset-profile'),
    });
    console.log(
      `[botlife] backstories written: ${report.backstories}, diary pages wiped: ${report.wiped}, ` +
        `added: ${report.added}, already there: ${report.skipped}`,
    );
  } catch (err) {
    console.error(`[botlife] ${err.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
