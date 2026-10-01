// Buddy's own life: a backstory, a diary of small things it "went through",
// and one mood per day. Pure data and pure functions; persona/life.js does
// the reading and writing.
//
// The mood is a number 0-100 (0 worst, 100 best). The palette below is the
// description layer under it: each band owns a range, the ranges tile the
// axis once, so score -> band is total. The dice throw twice: once for a
// band (tilted by the fresh diary and the E/I letter), once for a uniform
// point inside it. `rand` is injected so tests need not mock Math.random.
// The dark end is deliberately present and deliberately mild: sulky, tired,
// wistful, never frightened or angry at the child.

import { textFor } from './text/index.js';

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// ARRAY order is the dice order and is load-bearing for the seeded tests;
// the axis order lives in `range`.
export const MOODS = Object.freeze([
  { code: 'elated', range: [89, 100], tone: 'bright', energy: 'high', weight: 2 },
  { code: 'cheerful', range: [72, 88], tone: 'bright', energy: 'high', weight: 3 },
  { code: 'ordinary', range: [59, 71], tone: 'normal', energy: null, weight: 4 },
  { code: 'dreamy', range: [48, 58], tone: 'normal', energy: 'low', weight: 2 },
  { code: 'sluggish', range: [37, 47], tone: 'grey', energy: 'low', weight: 2 },
  { code: 'sad', range: [0, 11], tone: 'grey', energy: 'low', weight: 1.5 },
  { code: 'sulky', range: [12, 24], tone: 'grey', energy: null, weight: 1.5 },
  { code: 'wistful', range: [25, 36], tone: 'grey', energy: 'low', weight: 1.5 },
]);

// Clamps rather than returning null: a caller that decided to render a mood
// must not be handed a hole.
export function moodByScore(score) {
  const raw = Number(score);
  if (score === null || score === '' || !Number.isFinite(raw)) return null;
  const n = Math.min(100, Math.max(0, Math.round(raw)));
  return MOODS.find((m) => n >= m.range[0] && n <= m.range[1]) || null;
}

// Days roll at midnight in Vietnam wherever the server runs; toISOString
// would start the toy's new day at 07:00 local time.
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dayKey(date = new Date()) {
  return DAY_FORMAT.format(date);
}

export function addDays(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Tilts, not rules: a bright story doubles the bright bands' odds and a grey
// one the grey bands', the E/I letter nudges energy, and any band can still
// land on any day.
export function pickMood({ mbti = '', valence = 'normal', rand = Math.random } = {}) {
  const letter = String(mbti || '').trim().toUpperCase()[0];
  const weighted = MOODS.map((mood) => {
    let weight = mood.weight;
    if (valence === 'bright' && mood.tone === 'bright') weight *= 2;
    if (valence === 'grey' && mood.tone === 'grey') weight *= 2;
    if (letter === 'E' && mood.energy === 'high') weight *= 1.5;
    if (letter === 'I' && mood.energy === 'low') weight *= 1.5;
    return { mood, weight };
  });
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = rand() * total;
  for (const { mood, weight } of weighted) {
    roll -= weight;
    if (roll < 0) return mood;
  }
  return weighted[weighted.length - 1].mood;
}

export function pickMoodScore({ mbti = '', valence = 'normal', rand = Math.random } = {}) {
  const mood = pickMood({ mbti, valence, rand });
  const [lo, hi] = mood.range;
  const score = Math.min(hi, lo + Math.floor(rand() * (hi - lo + 1)));
  return { score, mood };
}

// The first clause of a diary page, lowercased into a "because ..." clause.
// Cosmetic lowercasing may hit a leading proper noun; accepted.
export function moodReasonFrom(story) {
  const text = String(story || '').trim();
  const match = text.match(/^[^.!?]{1,120}[.!?]?/);
  const sentence = (match ? match[0] : text.slice(0, 120)).trim();
  return sentence ? sentence[0].toLowerCase() + sentence.slice(1) : '';
}

// Diary dates are read aloud, so they come out as words.
export function dayLabel(day, today, lang) {
  const t = textFor(lang).life;
  const diff = daysBetween(day, today);
  if (diff === 0) return t.today;
  if (diff === 1) return t.yesterday;
  const [, m, d] = String(day).split('-');
  return t.dayMonth(d, m);
}

// Every part degrades on its own: no backstory, no diary or no mood each
// just drops its lines, and with nothing at all the block is ''.
export function botLifeBlock({ lang, backstory = '', diary = [], score = null, reason = '', moodFeel = false, today }) {
  const t = textFor(lang).life;
  const hasMood = score !== null && score !== '' && Number.isFinite(Number(score));
  const band = hasMood ? moodByScore(score) : null;
  const facts = String(backstory || '')
    .split('\n')
    .map((fact) => fact.trim())
    .filter(Boolean)
    .map((fact) => `- ${fact}`);
  const entries = (Array.isArray(diary) ? diary : [])
    .filter((row) => row && row.day && String(row.story || '').trim())
    .slice(0, 3)
    .map((row) => `- ${dayLabel(String(row.day), today, lang)}: ${String(row.story).trim()}`);

  if (!facts.length && !entries.length && !hasMood) return '';

  const feel = moodFeel && band ? t.moods[band.code] : null;
  return [
    ...t.header,
    ...facts,
    ...(entries.length ? [t.recentHeader, ...entries] : []),
    ...(hasMood
      ? [
          t.moodLine(Math.round(Number(score)), reason),
          ...(feel ? [t.feelLine(feel.key, feel.feel)] : []),
          ...t.legend,
        ]
      : []),
  ].join('\n');
}
