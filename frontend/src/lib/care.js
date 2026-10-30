// The rules behind the Care page (/app/care): which child and tab the
// address names, how an alert, a week, a trait or a memory is labelled, and
// how the Rules form becomes the body of PUT /children/:id/controls. Pure, so
// node --test covers them; the screens are in dashboard/care/.
//
// The lists of codes mirror backend-v2 (src/gateway/schemas.ts, the
// migrations' CHECK constraints), so every code the API can send has words in
// the dictionaries; tests/care.test.js checks that.
import { localeOf } from './format.js';

export const CARE_TABS = ['memory', 'safety', 'weekly', 'rules'];

const paramsOf = (search) => (search instanceof URLSearchParams ? search : new URLSearchParams(search ?? ''));
const waitingFor = (alerts, id) => (alerts?.[id] ?? 0) > 0;

// The child and tab to show. A missing or unknown child falls back to the
// first child with an alert waiting, then to the first child; a missing tab
// opens Safety while that child has an alert waiting, What Buddy knows
// otherwise. settled is false when the address should be rewritten to name
// both, so a default picked because of an alert stays put once the parent
// acknowledges it.
export function careState(search, children, alerts = {}) {
  const params = paramsOf(search);
  const list = children ?? [];
  const asked = params.get('child');
  const known = list.some((c) => c.id === asked);
  const childId = known ? asked : (list.find((c) => waitingFor(alerts, c.id))?.id ?? list[0]?.id ?? null);
  const askedTab = params.get('tab');
  const tabKnown = CARE_TABS.includes(askedTab);
  const tab = tabKnown ? askedTab : (childId && waitingFor(alerts, childId) ? 'safety' : 'memory');
  return { childId, tab, settled: !childId || (known && tabKnown) };
}

export function careHref({ childId, tab } = {}) {
  const params = new URLSearchParams();
  if (childId) params.set('child', childId);
  if (CARE_TABS.includes(tab)) params.set('tab', tab);
  const text = params.toString();
  return text ? `/app/care?${text}` : '/app/care';
}

// ---------- What Buddy knows ----------

export const LEARNING_CONSENT_VERSION = '2026-10';

// GET /consents answers { data: [{ kind, version, granted_at, revoked_at }] }.
export function hasConsent(consents, kind = 'learning') {
  const list = Array.isArray(consents) ? consents : (consents?.data ?? []);
  return list.some((c) => c?.kind === kind && !c.revoked_at);
}

export const SUMMARY_GROUPS = ['passions', 'likes', 'dislikes', 'fears', 'strengths'];
export const FACT_CATEGORIES = [
  'basics', 'likes', 'dislikes', 'fears', 'strengths', 'growing_edges', 'feelings',
  'routines', 'passions', 'play_style', 'dreams', 'family', 'other',
];
export const FACT_SOURCES = ['child', 'parent', 'setup', 'inferred'];
export const PERSON_KINDS = ['family', 'relative', 'friend', 'classmate', 'teacher', 'helper', 'pet', 'pretend', 'toy', 'place', 'other'];
export const EVENT_KINDS = ['upcoming', 'routine', 'milestone'];
export const RELATIONSHIP_KINDS = ['nickname', 'inside_joke', 'ritual', 'promise', 'shared_story', 'secret_greeting'];
export const TRAITS = ['outgoing', 'cautious', 'sensitive', 'persistent', 'curious'];
export const STAGES = ['meeting', 'buddies', 'best_friends'];

export function summaryEmpty(summary) {
  return SUMMARY_GROUPS.every((g) => !(Array.isArray(summary?.[g]) && summary[g].length));
}

// A code the site has no words for yet reads as the list's last entry
// ('other'), so a newer backend never shows a raw code to a parent.
export const known = (list, value) => (list.includes(value) ? value : list[list.length - 1]);
export const sourceOf = (source) => (FACT_SOURCES.includes(source) ? source : 'inferred');

// Items grouped by kind in the given order, empty groups left out. An
// unknown kind joins the 'other' group when the order has one, else the last.
export function groupByKind(items, order, field = 'kind') {
  const groups = order.map((k) => [k, []]);
  const at = new Map(order.map((k, i) => [k, i]));
  for (const item of items ?? []) {
    const i = at.get(item?.[field]) ?? at.get('other') ?? order.length - 1;
    groups[i][1].push(item);
  }
  return groups.filter(([, list]) => list.length);
}

// Traits are read from both ends (outgoing: chatty or slow to warm up), so
// each has two labels; a trait the site does not know is not shown.
export const knownTraits = (list) => (list ?? []).filter((tr) => TRAITS.includes(tr?.name));
export const traitSide = (trait) => `${trait.name}_${Number(trait.value) < 0 ? 'low' : 'high'}`;

// Only what the parent changed, so a rename does not also rewrite a relation
// the learner set a moment ago. null when nothing changed.
export function personPatch(person, draft) {
  const patch = {};
  const name = String(draft?.display_name ?? '').replace(/\s+/g, ' ').trim();
  if (name && name !== person.display_name) patch.display_name = name;
  if (draft?.kind && draft.kind !== person.kind) patch.kind = draft.kind;
  const relation = String(draft?.relation ?? '').replace(/\s+/g, ' ').trim() || null;
  if (relation !== (person.relation ?? null)) patch.relation = relation;
  return Object.keys(patch).length ? patch : null;
}

export function factPatch(fact, draft) {
  const patch = {};
  const statement = String(draft?.statement ?? '').replace(/\s+/g, ' ').trim();
  if (statement && statement !== fact.statement) patch.statement = statement;
  if (draft?.category && draft.category !== fact.category) patch.category = draft.category;
  return Object.keys(patch).length ? patch : null;
}

export const SPEECH_LEN = 60;

// POST /speech: a misheard word pairs what speech recognition writes with
// what the child means; a term is one of the child's own words (a toy, a
// cartoon), sent with meant equal to heard.
export function speechBody({ kind, heard, meant } = {}) {
  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, SPEECH_LEN);
  const term = kind === 'term';
  const h = clean(heard);
  const m = term ? h : clean(meant);
  const errors = [];
  if (!h) errors.push('heard');
  if (!term && !m) errors.push('meant');
  if (!term && h && m && h.toLowerCase() === m.toLowerCase()) errors.push('same');
  return { errors, body: { kind: term ? 'term' : 'misheard', heard: h, meant: m } };
}

export function splitSpeech(list) {
  const rows = list ?? [];
  return { misheard: rows.filter((r) => r.kind !== 'term'), terms: rows.filter((r) => r.kind === 'term') };
}

export const replaceById = (list, row) => (list ?? []).map((x) => (x.id === row.id ? row : x));
export const withoutId = (list, id) => (list ?? []).filter((x) => x.id !== id);

// backend-v2's next_cursor is an offset, so a page fetched after a row was
// added in front starts with a row already on screen; it is kept once.
export function appendPage(list, rows) {
  const items = list ?? [];
  const shown = new Set(items.map((x) => x.id));
  return [...items, ...(rows ?? []).filter((x) => !shown.has(x.id))];
}

// Whether a local change added or removed rows. Either one moves every later
// row's offset, so the cursor no longer points at the next unseen row; an
// edit in place moves nothing.
export function rowsMoved(before, after) {
  const a = before ?? [];
  const b = after ?? [];
  if (a.length !== b.length) return true;
  const ids = new Set(a.map((x) => x.id));
  return b.some((x) => !ids.has(x.id));
}

// ---------- Safety ----------

// What the classifier found in the child's words. A category starting with
// output: is Buddy's own answer caught by the output check.
export const ALERT_CATEGORIES = ['hurt', 'abuse', 'bullying', 'self_harm', 'unsafe', 'personal_info', 'left_out'];
export const ALERT_KINDS = [...ALERT_CATEGORIES, 'output', 'other'];

export function alertKind(category) {
  const c = String(category ?? '');
  if (c.startsWith('output:')) return 'output';
  return ALERT_CATEGORIES.includes(c) ? c : 'other';
}

export const severityTone = (severity) => (severity === 'urgent' ? 'bad' : 'warn');

const time = (ts) => {
  const n = Date.parse(ts ?? '');
  return Number.isFinite(n) ? n : 0;
};

// Waiting alerts first, urgent before concern; then the ones already seen.
// Newest first within each.
export function sortAlerts(list) {
  const rank = (a) => (a.acknowledged_at ? 2 : a.severity === 'urgent' ? 0 : 1);
  return [...(list ?? [])].sort((a, b) => rank(a) - rank(b) || time(b.created_at) - time(a.created_at));
}

export const waitingAlerts = (list) => (list ?? []).filter((a) => !a.acknowledged_at);

// ---------- Weekly digests ----------

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const utcDay = (day) => {
  const m = DAY.exec(String(day ?? ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
};

export function addDays(day, n) {
  const d = utcDay(day);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A calendar day ('YYYY-MM-DD', no time zone) in the site's language. UTC on
// both ends, so the day never shifts with the browser's zone.
export function dayLabel(day, lang, { year = false, weekday = false } = {}) {
  const d = utcDay(day);
  if (!d) return '';
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: 'numeric', month: lang === 'en' ? 'short' : 'numeric', timeZone: 'UTC',
    ...(year ? { year: 'numeric' } : {}), ...(weekday ? { weekday: 'long' } : {}),
  }).format(d);
}

// A digest covers Monday to Sunday: "26/10 – 1/11", "Oct 26 – Nov 1".
export function weekLabel(weekStart, lang) {
  const end = addDays(weekStart, 6);
  return end ? `${dayLabel(weekStart, lang)} – ${dayLabel(end, lang)}` : '';
}

// A moment (an ISO timestamp) on the parent's clock.
export function momentLabel(ts, lang) {
  const n = Date.parse(ts ?? '');
  if (!Number.isFinite(n)) return '';
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: 'numeric', month: lang === 'en' ? 'short' : 'numeric', hour: lang === 'en' ? 'numeric' : '2-digit', minute: '2-digit',
  }).format(new Date(n));
}

const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);

// The content the weekly job writes, with every part defaulted, so an older
// or partial digest still renders.
export function digestView(content) {
  const c = content ?? {};
  return {
    highlights: strings(c.highlights),
    newInterests: strings(c.new_interests),
    moodTrend: typeof c.mood_trend === 'string' ? c.mood_trend.trim() : '',
    people: strings(c.people),
    starters: strings(c.conversation_starters),
    growth: (Array.isArray(c.growth) ? c.growth : []).filter((g) => g?.before && g?.after),
    words: (Array.isArray(c.words) ? c.words : []).filter((w) => typeof w?.word === 'string' && w.word.trim()),
    turns: count(c.turns),
    minutes: count(c.minutes),
  };
}

// ---------- Rules (controls) ----------

export const LIMIT_PRESETS = [15, 30, 45, 60, 90];
export const LIMIT_MIN = 5;
export const LIMIT_MAX = 240;
export const DEFAULT_BEDTIME = '20:30';
export const QUIET_END_DEFAULT = '06:30';
export const MOOD_PIN_START = 70;
export const TOPICS_MAX = 20;
export const TOPIC_LEN = 60;

// What the daily limit picker shows for a stored value.
export function limitChoice(minutes) {
  if (minutes === null || minutes === undefined) return 'off';
  return LIMIT_PRESETS.includes(minutes) ? minutes : 'custom';
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

// Postgres sends times as 'HH:MM:SS'; <input type="time"> and the form use 'HH:MM'.
export function hhmm(value) {
  const m = TIME.exec(String(value ?? '').trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

export function clampMood(value) {
  const n = Math.round(Number(value));
  if (value === '' || value === null || !Number.isFinite(n)) return MOOD_PIN_START;
  return Math.max(0, Math.min(100, n));
}

// The same bands Buddy's mood is described with (backend-v2
// src/character/mood.ts moodWords), with a face for each.
export function moodBand(n) {
  if (n >= 85) return 'overjoyed';
  if (n >= 70) return 'cheerful';
  if (n >= 50) return 'ordinary';
  if (n >= 35) return 'sluggish';
  return 'low';
}

export const MOOD_BANDS = ['overjoyed', 'cheerful', 'ordinary', 'sluggish', 'low'];
const MOOD_FACES = { overjoyed: 'excited', cheerful: 'happy', ordinary: 'neutral', sluggish: 'sleepy', low: 'sad' };
export const moodFace = (n) => MOOD_FACES[moodBand(n)];

// The editable form for GET /controls. Quiet hours are on only when both ends
// are set, as the voice service reads them; when off, the times wait at
// bedtime to 06:30, which is what most families switch on.
export function controlsForm(c) {
  const limit = limitChoice(Number.isInteger(c?.daily_limit_min) ? c.daily_limit_min : null);
  const bedtime = hhmm(c?.bedtime) ?? DEFAULT_BEDTIME;
  const start = hhmm(c?.quiet_start);
  const end = hhmm(c?.quiet_end);
  return {
    limit,
    customLimit: limit === 'custom' ? String(c.daily_limit_min) : '',
    quietOn: Boolean(start && end),
    quietStart: start ?? bedtime,
    quietEnd: end ?? QUIET_END_DEFAULT,
    bedtime,
    topics: strings(c?.topics_to_avoid),
    moodPin: Number.isInteger(c?.mood_pin) && c.mood_pin >= 0 && c.mood_pin <= 100 ? c.mood_pin : null,
    surprise: c?.surprise_play !== false,
    speakFirst: c?.speak_first === true,
  };
}

// The form as PUT /controls wants it: the whole object without updated_at
// and etag. errors names the fields to fix first ('limit', 'quiet',
// 'bedtime'); the body is still complete, so it can be compared for changes.
export function controlsBody(form) {
  const errors = [];
  let daily = null;
  if (form.limit === 'custom') {
    const text = String(form.customLimit ?? '').trim();
    const n = Number(text);
    if (text && Number.isInteger(n) && n >= LIMIT_MIN && n <= LIMIT_MAX) daily = n;
    else errors.push('limit');
  } else if (LIMIT_PRESETS.includes(form.limit)) {
    daily = form.limit;
  }
  const start = form.quietOn ? hhmm(form.quietStart) : null;
  const end = form.quietOn ? hhmm(form.quietEnd) : null;
  if (form.quietOn && (!start || !end || start === end)) errors.push('quiet');
  const bedtime = hhmm(form.bedtime);
  if (!bedtime) errors.push('bedtime');
  return {
    errors,
    body: {
      daily_limit_min: daily,
      quiet_start: start && end ? start : null,
      quiet_end: start && end ? end : null,
      bedtime: bedtime ?? DEFAULT_BEDTIME,
      topics_to_avoid: strings(form.topics).slice(0, TOPICS_MAX),
      mood_pin: form.moodPin === null || form.moodPin === undefined ? null : clampMood(form.moodPin),
      surprise_play: form.surprise !== false,
      speak_first: form.speakFirst === true,
    },
  };
}

// Whether the form differs from what was loaded. A custom limit still being
// typed counts as a change, so Save stays reachable and can say what to fix.
export function controlsChanged(form, loaded) {
  if (!form || !loaded) return false;
  const now = controlsBody(form);
  if (now.errors.length) return true;
  return JSON.stringify(now.body) !== JSON.stringify(controlsBody(controlsForm(loaded)).body);
}

// Adds a trimmed entry unless it is empty, already there (in any case) or
// the list is full; the same list comes back then, so callers can tell.
export function addEntry(list, raw, { max, maxLen }) {
  const items = list ?? [];
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  if (!text || items.length >= max || items.some((x) => x.toLowerCase() === text.toLowerCase())) return items;
  return [...items, text];
}

export const removeEntry = (list, item) => (list ?? []).filter((x) => x !== item);

// ---------- Nudges and goals ----------

export const NUDGE_LEN = 300;
export const GOALS_MAX = 5;
export const GOAL_LEN = 60;

// The focuses Buddy has its own way of helping with (backend-v2
// src/voice/turn.ts GOALS); any other short text works too, as a gentle aim.
export const GOAL_SUGGESTIONS = ['english_words', 'sharing', 'bedtime_routine'];
export const goalKey = (focus) => (GOAL_SUGGESTIONS.includes(focus) ? `careGoal_${focus}` : null);

const pad = (n) => String(n).padStart(2, '0');
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// <input type="date"> gives a day on the parent's clock: a nudge waits until
// that day starts and expires when the chosen last day ends.
function dayAt(day, endOfDay) {
  const m = DAY.exec(String(day ?? ''));
  if (!m) return null;
  const d = endOfDay
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
    : new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toISOString();
}

export const dayStartIso = (day) => dayAt(day, false);
export const dayEndIso = (day) => dayAt(day, true);

// POST /nudges { content, use_after?, expires_at? }. errors: 'content' when
// empty, 'until' when the last day is before the first day or already past.
export function nudgeBody({ content, after, until } = {}, today = localDay()) {
  const text = String(content ?? '').trim().slice(0, NUDGE_LEN);
  const errors = [];
  if (!text) errors.push('content');
  const from = DAY.test(after ?? '') ? after : '';
  const to = DAY.test(until ?? '') ? until : '';
  if (to && (to < today || (from && to < from))) errors.push('until');
  const body = { content: text };
  if (from) body.use_after = dayStartIso(from);
  if (to) body.expires_at = dayEndIso(to);
  return { errors, body };
}

// GET /nudges sends pending and used ones, newest first. Nothing moves a
// nudge out of pending when its last day ends, but the voice service skips
// it from that moment (expires_at <= now), so those are listed apart.
export function splitNudges(list, now = new Date()) {
  const rows = list ?? [];
  const at = Number(now);
  const over = (n) => n.expires_at != null && Date.parse(n.expires_at) <= at;
  return {
    pending: rows.filter((n) => n.status === 'pending' && !over(n)),
    expired: rows.filter((n) => n.status === 'pending' && over(n)),
    used: rows.filter((n) => n.status === 'used'),
  };
}

// The parent's clock for a stored moment, as a day for "from 2/11" lines.
export function isoDay(ts) {
  const n = Date.parse(ts ?? '');
  return Number.isFinite(n) ? localDay(new Date(n)) : null;
}
