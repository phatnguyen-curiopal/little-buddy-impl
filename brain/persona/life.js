// Loads Buddy's life for one turn: backstory and diary per role and
// language, mood per toy per day. Moods are written even when learning is
// off, on purpose: a mood is Buddy's, not the child's, and the day must
// have one mood across turns and restarts.

import * as botlifeStore from '../store/botlife.js';
import { BACKSTORIES } from './botlife_seed.js';
import { botLifeBlock, dayKey, daysBetween, moodReasonFrom, pickMoodScore } from './botlife.js';

// The freshest page tilts the dice only while it is at most this old.
const FRESH_DAYS = 3;

export async function resolveMood(pool, { deviceId, role, lang, personality, today, rand = Math.random, diary = null }) {
  const existing = await botlifeStore.mood(pool, deviceId, today);
  if (existing) return existing;

  const pages = diary ?? (await botlifeStore.diary(pool, role, lang, today, 1));
  const latest = pages[0] || null;
  const fresh = latest && daysBetween(latest.day, today) <= FRESH_DAYS;
  const { score, mood } = pickMoodScore({ mbti: personality, valence: fresh ? latest.valence : 'normal', rand });
  // The reason sticks only when the mood matches the story that tilted the
  // dice; a grey mood on a bright day stays unexplained, like a human one.
  const reasonDay = fresh && mood.tone === latest.valence ? latest.day : null;
  await botlifeStore.insertMood(pool, deviceId, today, score, reasonDay);
  return (await botlifeStore.mood(pool, deviceId, today)) || { score, reason_day: reasonDay };
}

// Returns the ĐỜI SỐNG block ('' when there is nothing to say). A pin
// returns the pinned score and writes nothing.
export async function loadLife(pool, { config, deviceId, buddy, lang, moodPin = null, now = new Date(), rand }) {
  if (!config.botLife.enabled || config.llm.systemPromptOverride) return { block: '', score: null };
  const today = dayKey(now);
  const role = buddy.role;
  const [backstoryRow, diary] = await Promise.all([
    botlifeStore.backstory(pool, role, lang),
    botlifeStore.diary(pool, role, lang, today, 3),
  ]);
  const backstory = backstoryRow ?? BACKSTORIES[lang]?.[role] ?? '';

  let score = null;
  let reason = '';
  if (moodPin !== null && moodPin !== undefined) {
    score = moodPin;
  } else {
    const row = await resolveMood(pool, { deviceId, role, lang, personality: buddy.personality, today, rand, diary });
    score = row.score;
    if (row.reason_day) {
      const page = diary.find((d) => d.day === row.reason_day);
      reason = page ? moodReasonFrom(page.story) : '';
    }
  }
  const block = botLifeBlock({ lang, backstory, diary, score, reason, moodFeel: config.botLife.moodFeel, today });
  return { block, score };
}
