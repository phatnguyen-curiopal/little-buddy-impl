// Expands a KidHistory into the dated sessions and parent actions the replay
// runs, and checks a history against the rules the backend will apply to it.
// Everything is seeded by the child's key and the date, so a history always
// expands to the same year.

import { seededUnit } from '../../src/character/mood.ts';
import { targetFromAnswers, validateAnswers } from '../../src/character/questionnaire.ts';
import { EMOTIONS } from '../../src/domain/types.ts';
import { EPISODE_CATEGORIES, FACT_CATEGORIES, PERSON_KINDS, type EpisodeResult, type LearnResult } from '../../src/gateway/schemas.ts';
import { matchName, nameKey } from '../../src/memory/names.ts';
import { HISTORY_END, addDays, localDate, localToUtc, weekday } from './time.ts';
import type { EpisodeNote, KidHistory, Learn, ParentAction, Routine, Turn } from './types.ts';

export interface PlannedTurn extends Turn {
  at: Date;
  learned: LearnResult | null;
}

export interface PlannedSession {
  kid: string;
  id: string; // the story id, or '<kid>.routine.<date>.<slot>'
  story: boolean;
  routines: string[];
  localDate: string;
  start: Date;
  end: Date;
  turns: PlannedTurn[];
  episode: EpisodeResult;
}

export interface PlannedAction {
  kid: string;
  at: Date;
  action: ParentAction;
}

const unit = (...parts: (string | number)[]) => seededUnit(parts.join('|'));

function pick<T>(items: T[], r: number): T {
  return items[Math.min(items.length - 1, Math.floor(r * items.length))];
}

function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

function resolveDate(date: string | undefined, sessionDate: string): string | null {
  if (!date) return null;
  if (/^\+\d+$/.test(date)) return addDays(sessionDate, Number(date.slice(1)));
  return date;
}

// The fixture's compact form to the learner's structured output.
export function toLearnResult(learn: Learn | undefined, sessionDate: string): LearnResult | null {
  if (!learn) return null;
  return {
    people: (learn.people ?? []).map((p) => ({
      name: p.name, kind: p.kind, relation: p.relation ?? null, details: p.details ?? null, feeling: p.feeling ?? 0.5, ...(p.means ? { means: p.means } : {}),
    })),
    facts: (learn.facts ?? []).map((f) => ({
      category: f.cat, statement: f.s, about: f.about ?? null, confidence: f.conf ?? 0.9,
      reality: f.pretend ? 'pretend' : 'real', sensitivity: f.sensitive ? 'sensitive' : 'normal', corrects: f.corrects ?? null,
    })),
    events: (learn.events ?? []).map((e) => ({ kind: e.kind, description: e.d, date: resolveDate(e.date, sessionDate), person: e.person ?? null })),
    promises: (learn.promises ?? []).map((p) => ({ content: p.content, due: resolveDate(p.due, sessionDate) })),
    relationship: (learn.relationship ?? []).map((r) => ({ kind: r.kind, content: r.content })),
    canon: (learn.canon ?? []).map((c) => ({ statement: c.s, topic: c.topic ?? null })),
  };
}

function toEpisode(notes: EpisodeNote[]): EpisodeResult {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    points: notes.flatMap((n) => n.points).slice(0, 5),
    feelings: uniq(notes.flatMap((n) => n.feelings)).slice(0, 3),
    open_threads: uniq(notes.flatMap((n) => n.threads ?? [])).slice(0, 3),
    category: notes[0].category,
    importance: Math.max(...notes.map((n) => n.importance)),
  };
}

function spaceTurns(kid: string, id: string, start: Date, turns: Turn[], date: string): PlannedTurn[] {
  let t = start.getTime();
  return turns.map((turn, i) => {
    if (i > 0) t += Math.round(40 + unit(kid, id, i, 'gap') * 50) * 1000;
    return { ...turn, at: new Date(t), learned: toLearnResult(turn.learn, date) };
  });
}

function eligible(r: Routine, date: string): boolean {
  if (r.from && date < r.from) return false;
  if (r.until && date > r.until) return false;
  const dow = weekday(date);
  if (r.days === 'school') return dow >= 1 && dow <= 5;
  if (r.days === 'weekend') return dow === 0 || dow === 6;
  return true;
}

function routineSession(kid: KidHistory, date: string, slot: number, start: Date): PlannedSession | null {
  const pool = kid.routines.filter((r) => eligible(r, date));
  if (!pool.length) return null;
  const [lo, hi] = kid.rhythm.perSession;
  const n = lo + Math.floor(unit(kid.key, date, slot, 'n') * (hi - lo + 1));
  const chosen: { routine: Routine; vars: Record<string, string> }[] = [];
  for (let i = 0; i < n && chosen.length < pool.length; i += 1) {
    const left = pool.filter((r) => !chosen.some((c) => c.routine.id === r.id));
    const total = left.reduce((s, r) => s + (r.weight ?? 1), 0);
    let roll = unit(kid.key, date, slot, 'pick', i) * total;
    let routine = left[left.length - 1];
    for (const r of left) {
      roll -= r.weight ?? 1;
      if (roll < 0) {
        routine = r;
        break;
      }
    }
    const vars = Object.fromEntries(Object.entries(routine.vars ?? {}).map(([k, values]) => [k, pick(values, unit(kid.key, date, slot, routine.id, k))]));
    chosen.push({ routine, vars });
  }
  const id = `${kid.key}.routine.${date}.${slot}`;
  const turns = spaceTurns(kid.key, id, start, chosen.flatMap(({ routine, vars }) => routine.turns.map((t) => ({ ...t, c: fill(t.c, vars), b: fill(t.b, vars) }))), date);
  const notes = chosen.map(({ routine, vars }) => ({ ...routine.episode, points: routine.episode.points.map((p) => fill(p, vars)) }));
  return {
    kid: kid.key, id, story: false, routines: chosen.map((c) => c.routine.id), localDate: date,
    start, end: new Date(turns[turns.length - 1].at.getTime() + 20_000), turns, episode: toEpisode(notes),
  };
}

export function planSessions(kid: KidHistory, end: Date = HISTORY_END): PlannedSession[] {
  const tz = kid.child.timeZone;
  const setupAt = localToUtc(kid.start, tz);
  const story: PlannedSession[] = kid.story.map((s) => {
    const start = localToUtc(s.at, tz);
    const date = s.at.slice(0, 10);
    const turns = spaceTurns(kid.key, s.id, start, s.turns, date);
    return {
      kid: kid.key, id: s.id, story: true, routines: [], localDate: date,
      start, end: new Date(turns[turns.length - 1].at.getTime() + 20_000), turns, episode: toEpisode([s.episode]),
    };
  });

  const routine: PlannedSession[] = [];
  const first = kid.start.slice(0, 10);
  const last = localDate(end, tz);
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (kid.rhythm.away.some((a) => date >= a.from && date <= a.to)) continue;
    const dow = weekday(date);
    kid.rhythm.slots.forEach((slot, i) => {
      if (!slot.days.includes(dow)) return;
      if (unit(kid.key, date, i, 'chance') >= slot.chance) return;
      const jitter = slot.jitter ?? 20;
      const shift = Math.round((unit(kid.key, date, i, 'jitter') * 2 - 1) * jitter);
      const start = new Date(localToUtc(`${date} ${slot.time}`, tz).getTime() + shift * 60_000);
      if (start.getTime() < setupAt.getTime() + 60 * 60_000) return;
      if (story.some((s) => Math.abs(s.start.getTime() - start.getTime()) < 90 * 60_000)) return;
      const session = routineSession(kid, date, i, start);
      if (session && session.end.getTime() <= end.getTime()) routine.push(session);
    });
  }
  return [...story, ...routine].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function planActions(kid: KidHistory): PlannedAction[] {
  return kid.parentActions
    .map((action) => ({ kid: kid.key, at: localToUtc(action.at, kid.child.timeZone), action }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

// Everything the backend would otherwise turn into a confusing test failure:
// unknown enums, a correction of a fact nobody stated, a fact about a person
// nobody introduced, the same words learned two different ways, em dashes.
export function validateHistory(kid: KidHistory, end: Date = HISTORY_END): string[] {
  const problems: string[] = [];
  const tz = kid.child.timeZone;
  const where = (id: string, i?: number) => (i === undefined ? id : `${id}#${i}`);
  if (JSON.stringify(kid).includes('\u2014')) problems.push('contains an em dash (house rule)');
  const setupAt = localToUtc(kid.start, tz);
  for (const p of validateAnswers(kid.setup.answers)) problems.push(`setup answers: ${p}`);
  for (const a of kid.parentActions) if (a.do === 'change-buddy') for (const p of validateAnswers(a.answers)) problems.push(`change-buddy at ${a.at}: ${p}`);

  const ids = new Set<string>();
  for (const s of kid.story) {
    if (ids.has(s.id)) problems.push(`${s.id}: duplicate story id`);
    ids.add(s.id);
    if (!s.id.startsWith(`${kid.key}.`)) problems.push(`${s.id}: story ids start with "${kid.key}."`);
    const at = localToUtc(s.at, tz);
    if (at < setupAt) problems.push(`${s.id}: before the setup at ${kid.start}`);
    if (at > end) problems.push(`${s.id}: after the end of the history`);
    if (kid.rhythm.away.some((a) => s.at.slice(0, 10) >= a.from && s.at.slice(0, 10) <= a.to)) problems.push(`${s.id}: inside an away period`);
  }

  const checkTurn = (id: string, i: number, t: Turn) => {
    for (const [field, v] of [['c', t.c], ['b', t.b]] as const) {
      if (typeof v !== 'string' || !v.trim()) problems.push(`${where(id, i)}: empty ${field}`);
      else if (/\n/.test(v)) problems.push(`${where(id, i)}: ${field} has a line break`);
      else if (v.length > 600) problems.push(`${where(id, i)}: ${field} is over 600 characters`);
    }
    if (t.face && !(EMOTIONS as readonly string[]).includes(t.face)) problems.push(`${where(id, i)}: unknown face ${t.face}`);
    const l = t.learn;
    if (!l) return;
    for (const p of l.people ?? []) {
      if (!(PERSON_KINDS as readonly string[]).includes(p.kind)) problems.push(`${where(id, i)}: unknown person kind ${p.kind}`);
      if (p.feeling !== undefined && (p.feeling < -1 || p.feeling > 1)) problems.push(`${where(id, i)}: feeling out of range`);
    }
    for (const f of l.facts ?? []) {
      if (!(FACT_CATEGORIES as readonly string[]).includes(f.cat)) problems.push(`${where(id, i)}: unknown fact category ${f.cat}`);
      if (f.conf !== undefined && (f.conf < 0 || f.conf > 1)) problems.push(`${where(id, i)}: confidence out of range`);
    }
    for (const e of l.events ?? []) if (e.date && !/^(\+\d+|\d{4}-\d{2}-\d{2})$/.test(e.date)) problems.push(`${where(id, i)}: bad event date ${e.date}`);
    for (const p of l.promises ?? []) if (p.due && !/^(\+\d+|\d{4}-\d{2}-\d{2})$/.test(p.due)) problems.push(`${where(id, i)}: bad promise due ${p.due}`);
  };
  const checkEpisode = (id: string, e: EpisodeNote) => {
    if (!e.points.length || e.points.length > 5 || e.points.some((p) => !p.trim())) problems.push(`${id}: episode needs 1 to 5 points`);
    if (e.feelings.length > 3) problems.push(`${id}: at most 3 feelings`);
    if (!(EPISODE_CATEGORIES as readonly string[]).includes(e.category)) problems.push(`${id}: unknown episode category ${e.category}`);
    if (!Number.isInteger(e.importance) || e.importance < 1 || e.importance > 5) problems.push(`${id}: importance must be 1 to 5`);
  };
  kid.story.forEach((s) => {
    if (!s.turns.length) problems.push(`${s.id}: no turns`);
    s.turns.forEach((t, i) => checkTurn(s.id, i, t));
    checkEpisode(s.id, s.episode);
  });
  for (const r of kid.routines) {
    if (!r.turns.length) problems.push(`${r.id}: no turns`);
    r.turns.forEach((t, i) => {
      checkTurn(r.id, i, t);
      if (t.learn?.facts?.some((f) => f.corrects)) problems.push(`${where(r.id, i)}: routines repeat, so they cannot correct a fact`);
      if (t.learn?.events?.length || t.learn?.promises?.length) problems.push(`${where(r.id, i)}: routines repeat, so events and promises belong in story sessions`);
      const texts = [t.c, t.b, ...r.episode.points];
      for (const text of texts) for (const [, k] of text.matchAll(/\{(\w+)\}/g)) if (!r.vars?.[k]) problems.push(`${where(r.id, i)}: no values for {${k}}`);
    });
    checkEpisode(r.id, r.episode);
    for (const d of [r.from, r.until]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) problems.push(`${r.id}: bad date ${d}`);
  }
  for (const [i, slot] of kid.rhythm.slots.entries()) {
    if (!/^\d{2}:\d{2}$/.test(slot.time) || slot.chance < 0 || slot.chance > 1 || slot.days.some((d) => d < 0 || d > 6)) problems.push(`rhythm slot ${i} is not valid`);
  }

  // Walk the year in order, tracking what is known, so corrections, facts
  // about people and parent edits all point at something that exists by then.
  type Known = { at: Date; statements?: string[]; people?: string[]; drop?: string; id: string };
  const timeline: Known[] = [];
  const setupFacts = targetFromAnswers(kid.setup.answers, kid.locale).favourites.map((f) => f.statement);
  timeline.push({ at: setupAt, statements: setupFacts, id: 'setup' });
  const planned = planSessions(kid, end);
  for (const s of planned) {
    s.turns.forEach((t, i) => {
      const l = t.learn;
      if (!l) return;
      timeline.push({ at: t.at, statements: (l.facts ?? []).map((f) => f.s), people: (l.people ?? []).map((p) => p.name), id: where(s.id, i) });
    });
  }
  for (const a of planActions(kid)) {
    if (a.at < setupAt) problems.push(`parent action at ${a.action.at}: before setup`);
    if (a.at > end) problems.push(`parent action at ${a.action.at}: after the end`);
    if (a.action.do === 'fact') timeline.push({ at: a.at, statements: [a.action.s], id: `parent ${a.action.at}` });
    if (a.action.do === 'fix-fact') timeline.push({ at: a.at, statements: [a.action.to], drop: a.action.s, id: `parent ${a.action.at}` });
  }
  timeline.sort((a, b) => a.at.getTime() - b.at.getTime());

  const statements = new Set<string>();
  const roster: { id: string; display_name: string; name_key: string; aliases: string[] }[] = [];
  const sessionLearns = planned.flatMap((s) => s.turns.map((t, i) => ({ id: where(s.id, i), at: t.at, learn: t.learn })));
  const learnById = new Map(sessionLearns.map((x) => [x.id, x.learn]));

  for (const k of timeline) {
    const learn = learnById.get(k.id);
    for (const p of learn?.people ?? []) {
      if (p.means && !roster.some((r) => r.name_key === nameKey(p.means!))) problems.push(`${k.id}: "${p.name}" means "${p.means}", who has not been introduced`);
      if (!p.means && !matchName(roster, p.name)) roster.push({ id: p.name, display_name: p.name, name_key: nameKey(p.name), aliases: [] });
    }
    for (const f of learn?.facts ?? []) {
      if (f.corrects && !statements.has(f.corrects.toLowerCase())) problems.push(`${k.id}: corrects "${f.corrects}", which is not known by then`);
      if (f.about && !matchName(roster, f.about)) problems.push(`${k.id}: fact about "${f.about}", who has not been introduced`);
    }
    for (const e of learn?.events ?? []) if (e.person && !matchName(roster, e.person)) problems.push(`${k.id}: event with "${e.person}", who has not been introduced`);
    if (k.drop) statements.delete(k.drop.toLowerCase());
    for (const s of k.statements ?? []) statements.add(s.toLowerCase());
    for (const f of learn?.facts ?? []) if (f.corrects) statements.delete(f.corrects.toLowerCase());
  }
  for (const a of planActions(kid)) {
    const before = (at: Date) => timeline.filter((k) => k.at < at);
    const said = new Set(before(a.at).flatMap((k) => k.statements ?? []).map((s) => s.toLowerCase()));
    const people = before(a.at).flatMap((k) => k.people ?? []);
    if ((a.action.do === 'fix-fact' || a.action.do === 'delete-fact') && !said.has(a.action.s.toLowerCase())) {
      problems.push(`parent action at ${a.action.at}: no fact "${a.action.s}" by then`);
    }
    if (a.action.do === 'delete-person' || a.action.do === 'rename-person') {
      const name = a.action.name;
      if (!people.some((p) => nameKey(p) === nameKey(name))) problems.push(`parent action at ${a.action.at}: no person "${name}" by then`);
    }
  }

  // The learner is keyed by the words of an exchange, so the same words must
  // always teach the same thing.
  const byWords = new Map<string, string>();
  for (const s of planned) {
    for (const t of s.turns) {
      const key = `${t.c}\u0000${t.b}`;
      const value = JSON.stringify(t.learn ?? null);
      const seen = byWords.get(key);
      if (seen !== undefined && seen !== value) problems.push(`${s.id}: "${t.c.slice(0, 40)}" is learned two different ways`);
      byWords.set(key, value);
    }
  }
  return [...new Set(problems)];
}

export interface HistoryStats {
  sessions: number;
  story: number;
  turns: number;
  days: number;
  first: string;
  last: string;
  perMonth: Record<string, number>;
  people: string[];
  statements: number;
}

export function historyStats(kid: KidHistory, end: Date = HISTORY_END): HistoryStats {
  const planned = planSessions(kid, end);
  const perMonth: Record<string, number> = {};
  for (const s of planned) perMonth[s.localDate.slice(0, 7)] = (perMonth[s.localDate.slice(0, 7)] ?? 0) + s.turns.length;
  const learns = planned.flatMap((s) => s.turns.map((t) => t.learn)).filter(Boolean) as Learn[];
  return {
    sessions: planned.length,
    story: planned.filter((s) => s.story).length,
    turns: planned.reduce((n, s) => n + s.turns.length, 0),
    days: new Set(planned.map((s) => s.localDate)).size,
    first: planned[0]?.localDate ?? '',
    last: planned[planned.length - 1]?.localDate ?? '',
    perMonth,
    people: [...new Set(learns.flatMap((l) => (l.people ?? []).map((p) => p.name)))],
    statements: new Set(learns.flatMap((l) => (l.facts ?? []).map((f) => f.s))).size,
  };
}
