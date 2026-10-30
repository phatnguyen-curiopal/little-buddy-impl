import { test } from 'node:test';
import assert from 'node:assert/strict';
import vi from '../src/i18n/vi.js';
import en from '../src/i18n/en.js';
import {
  ALERT_KINDS, CARE_TABS, EVENT_KINDS, FACT_CATEGORIES, FACT_SOURCES, GOAL_SUGGESTIONS, LIMIT_MAX, LIMIT_MIN, MOOD_BANDS, PERSON_KINDS,
  RELATIONSHIP_KINDS, STAGES, SUMMARY_GROUPS, TOPICS_MAX, TRAITS,
  addDays, addEntry, alertKind, appendPage, careHref, careState, clampMood, controlsBody, controlsChanged, controlsForm, dayEndIso, dayLabel,
  dayStartIso, digestView, factPatch, goalKey, groupByKind, hasConsent, hhmm, isoDay, known, knownTraits, limitChoice, localDay,
  moodBand, moodFace, nudgeBody, personPatch, removeEntry, replaceById, rowsMoved, severityTone, sortAlerts, sourceOf, speechBody, splitNudges,
  splitSpeech, summaryEmpty, traitSide, waitingAlerts, weekLabel, withoutId,
} from '../src/lib/care.js';
import { EMOTIONS } from '../src/lib/emotions.js';

const KIDS = [{ id: 'a', name: 'Na' }, { id: 'b', name: 'Bin' }];

test('the address picks the child and the tab, with sensible defaults', () => {
  assert.deepEqual(careState('?child=b&tab=rules', KIDS), { childId: 'b', tab: 'rules', settled: true });
  assert.deepEqual(careState('', KIDS), { childId: 'a', tab: 'memory', settled: false });
  assert.deepEqual(careState('?child=gone&tab=nope', KIDS), { childId: 'a', tab: 'memory', settled: false });
  assert.deepEqual(careState(new URLSearchParams('child=b'), KIDS), { childId: 'b', tab: 'memory', settled: false });
  assert.deepEqual(careState('', []), { childId: null, tab: 'memory', settled: true }, 'no child: nothing to rewrite');
});

test('a waiting alert decides the default child and opens Safety, but never overrides the address', () => {
  assert.deepEqual(careState('', KIDS, { a: 0, b: 2 }), { childId: 'b', tab: 'safety', settled: false });
  assert.deepEqual(careState('?child=a', KIDS, { b: 2 }), { childId: 'a', tab: 'memory', settled: false });
  assert.deepEqual(careState('?child=b&tab=weekly', KIDS, { b: 2 }), { childId: 'b', tab: 'weekly', settled: true });
});

test('care links name the child and the tab', () => {
  assert.equal(careHref({ childId: 'a b', tab: 'safety' }), '/app/care?child=a+b&tab=safety');
  assert.equal(careHref({ childId: 'a', tab: 'bogus' }), '/app/care?child=a');
  assert.equal(careHref(), '/app/care');
  for (const tab of CARE_TABS) assert.equal(careState(new URL(careHref({ childId: 'a', tab }), 'http://x').searchParams, KIDS).settled, true);
});

test('learning consent counts only while it is not withdrawn', () => {
  assert.equal(hasConsent({ data: [{ kind: 'learning', version: '2026-10', revoked_at: null }] }), true);
  assert.equal(hasConsent({ data: [{ kind: 'learning', revoked_at: '2026-10-01T00:00:00Z' }] }), false);
  assert.equal(hasConsent([{ kind: 'terms', revoked_at: null }]), false);
  assert.equal(hasConsent(null), false);
});

test('a summary with no chips is empty, whatever the counts say', () => {
  assert.equal(summaryEmpty({ passions: [], likes: [], counts: { people: 2 } }), true);
  assert.equal(summaryEmpty({ likes: ['mangoes'] }), false);
  assert.equal(summaryEmpty(null), true);
});

test('unknown codes fall back to the list\'s last entry', () => {
  assert.equal(known(PERSON_KINDS, 'robot'), 'other');
  assert.equal(known(FACT_CATEGORIES, 'likes'), 'likes');
  assert.equal(sourceOf('parent'), 'parent');
  assert.equal(sourceOf('martian'), 'inferred');
});

test('items group by kind in order; unknown kinds join other', () => {
  const items = [{ kind: 'milestone', id: 1 }, { kind: 'upcoming', id: 2 }, { kind: 'upcoming', id: 3 }];
  assert.deepEqual(groupByKind(items, EVENT_KINDS).map(([k, list]) => [k, list.map((x) => x.id)]), [['upcoming', [2, 3]], ['milestone', [1]]]);
  assert.deepEqual(groupByKind([{ kind: 'robot' }], PERSON_KINDS).map(([k]) => k), ['other']);
  assert.deepEqual(groupByKind(undefined, EVENT_KINDS), []);
});

test('traits read from both ends; unknown traits are hidden', () => {
  assert.equal(traitSide({ name: 'outgoing', value: 0.6 }), 'outgoing_high');
  assert.equal(traitSide({ name: 'outgoing', value: -0.4 }), 'outgoing_low');
  assert.deepEqual(knownTraits([{ name: 'curious' }, { name: 'grumpy' }]).map((x) => x.name), ['curious']);
});

test('edits send only what the parent changed', () => {
  const person = { display_name: 'Bà nội', kind: 'family', relation: 'grandmother' };
  assert.equal(personPatch(person, { display_name: ' Bà nội ', kind: 'family', relation: 'grandmother' }), null);
  assert.deepEqual(personPatch(person, { display_name: 'Bà Nội', kind: 'family', relation: '' }), { display_name: 'Bà Nội', relation: null });
  assert.deepEqual(personPatch({ ...person, relation: null }, { display_name: 'Bà nội', kind: 'relative', relation: 'bà' }), { kind: 'relative', relation: 'bà' });
  assert.equal(personPatch(person, { display_name: '   ', kind: 'family', relation: 'grandmother' }), null, 'an empty name is not a rename');
  const fact = { statement: 'loves mangoes', category: 'likes' };
  assert.equal(factPatch(fact, { statement: 'loves  mangoes ', category: 'likes' }), null);
  assert.deepEqual(factPatch(fact, { statement: 'loves mangoes', category: 'passions' }), { category: 'passions' });
});

test('a speech entry is a misheard pair or one of the child\'s own words', () => {
  assert.deepEqual(speechBody({ kind: 'misheard', heard: ' đau  lăn ', meant: 'đau răng' }), { errors: [], body: { kind: 'misheard', heard: 'đau lăn', meant: 'đau răng' } });
  assert.deepEqual(speechBody({ kind: 'term', heard: 'Gao', meant: 'ignored' }).body, { kind: 'term', heard: 'Gao', meant: 'Gao' });
  assert.deepEqual(speechBody({ kind: 'misheard', heard: 'Mèo', meant: 'mèo' }).errors, ['same']);
  assert.deepEqual(speechBody({ kind: 'misheard', heard: '', meant: '' }).errors, ['heard', 'meant']);
  assert.deepEqual(speechBody({ kind: 'term', heard: '' }).errors, ['heard']);
  assert.equal(speechBody({ heard: 'x'.repeat(80), meant: 'y' }).body.heard.length, 60);
  const rows = [{ id: 1, kind: 'misheard' }, { id: 2, kind: 'term' }];
  assert.deepEqual(splitSpeech(rows), { misheard: [rows[0]], terms: [rows[1]] });
});

test('list helpers replace and remove by id', () => {
  const list = [{ id: 1, v: 'a' }, { id: 2, v: 'b' }];
  assert.deepEqual(replaceById(list, { id: 2, v: 'c' }), [{ id: 1, v: 'a' }, { id: 2, v: 'c' }]);
  assert.deepEqual(withoutId(list, 1), [{ id: 2, v: 'b' }]);
  assert.deepEqual(withoutId(null, 1), []);
});

// The server pages by offset: [a b c | d e f] with the cursor at 3.
const ROWS = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
const ids = (list) => list.map((x) => x.id);

test('a next page that repeats a row already shown keeps it once', () => {
  const shown = ROWS.slice(0, 3);
  assert.deepEqual(ids(appendPage(shown, ROWS.slice(3))), ['a', 'b', 'c', 'd', 'e', 'f'], 'nothing moved: the page is appended as is');
  // A row added in front pushes c past the cursor, so the next page starts with it.
  const added = [{ id: 'new' }, ...shown];
  const page = [{ id: 'new' }, ...ROWS].slice(3, 6);
  assert.deepEqual(ids(page), ['c', 'd', 'e']);
  assert.deepEqual(ids(appendPage(added, page)), ['new', 'a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(ids(appendPage(null, ROWS.slice(0, 2))), ['a', 'b']);
  assert.deepEqual(ids(appendPage(shown, undefined)), ['a', 'b', 'c']);
});

test('only an add or a delete moves the rows under the cursor', () => {
  const shown = ROWS.slice(0, 3);
  assert.equal(rowsMoved(shown, withoutId(shown, 'b')), true, 'a delete: the next page would skip d');
  assert.equal(rowsMoved(shown, [{ id: 'new' }, ...shown]), true, 'an add: the next page would repeat c');
  assert.equal(rowsMoved(shown, [{ id: 'new' }, ...withoutId(shown, 'c')]), true, 'one in, one out: same length, other rows');
  assert.equal(rowsMoved(shown, replaceById(shown, { id: 'b', v: 'edited' })), false, 'an edit in place');
  assert.equal(rowsMoved(shown, shown.map((x) => ({ ...x, acknowledged_at: '2026-10-30T09:00:00Z' }))), false, 'marked as seen');
  assert.equal(rowsMoved(shown, [...shown].reverse()), false, 'the same rows in another order');
  assert.equal(rowsMoved(null, []), false);
});

test('alert categories get a friendly kind; output checks are grouped', () => {
  assert.equal(alertKind('bullying'), 'bullying');
  assert.equal(alertKind('output:secrecy'), 'output');
  assert.equal(alertKind('output:moderation'), 'output');
  assert.equal(alertKind('harassment'), 'other');
  assert.equal(alertKind(null), 'other');
  assert.equal(severityTone('urgent'), 'bad');
  assert.equal(severityTone('concern'), 'warn');
});

test('waiting alerts come first, urgent before concern, newest first', () => {
  const list = [
    { id: 'old-concern', severity: 'concern', created_at: '2026-10-01T08:00:00Z', acknowledged_at: null },
    { id: 'seen-urgent', severity: 'urgent', created_at: '2026-10-29T08:00:00Z', acknowledged_at: '2026-10-29T09:00:00Z' },
    { id: 'new-concern', severity: 'concern', created_at: '2026-10-20T08:00:00Z', acknowledged_at: null },
    { id: 'urgent', severity: 'urgent', created_at: '2026-10-02T08:00:00Z', acknowledged_at: null },
  ];
  assert.deepEqual(sortAlerts(list).map((a) => a.id), ['urgent', 'new-concern', 'old-concern', 'seen-urgent']);
  assert.deepEqual(waitingAlerts(list).map((a) => a.id), ['old-concern', 'new-concern', 'urgent']);
  assert.deepEqual(sortAlerts(undefined), []);
});

test('days and weeks read naturally in both languages, without shifting', () => {
  assert.equal(addDays('2026-10-26', 6), '2026-11-01');
  assert.equal(addDays('2026-12-28', 6), '2027-01-03');
  assert.equal(addDays('not a day', 1), null);
  assert.equal(weekLabel('2026-10-26', 'vi'), '26/10 – 1/11');
  assert.equal(weekLabel('2026-10-26', 'en'), 'Oct 26 – Nov 1');
  assert.equal(weekLabel('', 'en'), '');
  assert.equal(dayLabel('2026-10-12', 'vi', { year: true }), '12/10/2026');
  assert.equal(dayLabel('2026-10-12', 'en', { year: true }), 'Oct 12, 2026');
});

test('a digest renders even when parts are missing', () => {
  const v = digestView({ highlights: ['Talked about pets', ''], mood_trend: ' cheerful ', turns: '42', minutes: 35.6, growth: [{ before: 'scared of the dark', after: 'sleeps with the light off' }, { before: 'x' }] });
  assert.deepEqual(v.highlights, ['Talked about pets']);
  assert.equal(v.moodTrend, 'cheerful');
  assert.equal(v.turns, 42);
  assert.equal(v.minutes, 36);
  assert.equal(v.growth.length, 1);
  assert.deepEqual(digestView(null), { highlights: [], newInterests: [], moodTrend: '', people: [], starters: [], growth: [], words: [], turns: 0, minutes: 0 });
});

test('the daily limit picker shows off, a preset or custom', () => {
  assert.equal(limitChoice(null), 'off');
  assert.equal(limitChoice(30), 30);
  assert.equal(limitChoice(25), 'custom');
});

test('times come as HH:MM:SS and go as HH:MM', () => {
  assert.equal(hhmm('20:30:00'), '20:30');
  assert.equal(hhmm('07:05'), '07:05');
  assert.equal(hhmm('24:00'), null);
  assert.equal(hhmm(null), null);
});

const LOADED = {
  daily_limit_min: null, quiet_start: null, quiet_end: null, bedtime: '20:30:00', topics_to_avoid: [], mood_pin: null,
  surprise_play: true, speak_first: false, updated_at: '2026-10-30T00:00:00Z', etag: '123',
};

test('the controls form starts from what was loaded', () => {
  const f = controlsForm(LOADED);
  assert.deepEqual(f, {
    limit: 'off', customLimit: '', quietOn: false, quietStart: '20:30', quietEnd: '06:30', bedtime: '20:30', topics: [],
    moodPin: null, surprise: true, speakFirst: false,
  });
  assert.equal(controlsForm({ ...LOADED, daily_limit_min: 25 }).customLimit, '25');
  assert.equal(controlsForm({ ...LOADED, quiet_start: '21:00:00', quiet_end: null }).quietOn, false, 'one end alone is off, as the toy reads it');
  assert.equal(controlsForm({}).bedtime, '20:30');
});

test('the controls body is the whole object without updated_at and etag', () => {
  const { body, errors } = controlsBody(controlsForm(LOADED));
  assert.deepEqual(errors, []);
  assert.deepEqual(body, {
    daily_limit_min: null, quiet_start: null, quiet_end: null, bedtime: '20:30', topics_to_avoid: [], mood_pin: null,
    surprise_play: true, speak_first: false,
  });
  assert.ok(!('etag' in body) && !('updated_at' in body));
  const edited = { ...controlsForm(LOADED), limit: 45, quietOn: true, quietStart: '12:00', quietEnd: '14:00', moodPin: 101, topics: ['ghosts'], speakFirst: true };
  assert.deepEqual(controlsBody(edited).body, {
    daily_limit_min: 45, quiet_start: '12:00', quiet_end: '14:00', bedtime: '20:30', topics_to_avoid: ['ghosts'], mood_pin: 100,
    surprise_play: true, speak_first: true,
  });
});

test('a stored "speaks first" goes back as it was when the switch is hidden', () => {
  // While /me says speak_first is false the Rules form leaves the switch out,
  // so a save of any other rule must not turn a stored true into false.
  const stored = { ...LOADED, speak_first: true };
  assert.equal(controlsBody({ ...controlsForm(stored), limit: 45 }).body.speak_first, true);
  assert.equal(controlsChanged(controlsForm(stored), stored), false, 'nothing to save until the parent changes something');
});

test('the controls body says what to fix first', () => {
  const base = controlsForm(LOADED);
  assert.deepEqual(controlsBody({ ...base, limit: 'custom', customLimit: '4' }).errors, ['limit']);
  assert.deepEqual(controlsBody({ ...base, limit: 'custom', customLimit: `${LIMIT_MAX + 1}` }).errors, ['limit']);
  assert.deepEqual(controlsBody({ ...base, limit: 'custom', customLimit: '' }).errors, ['limit']);
  assert.deepEqual(controlsBody({ ...base, limit: 'custom', customLimit: '12.5' }).errors, ['limit']);
  assert.equal(controlsBody({ ...base, limit: 'custom', customLimit: `${LIMIT_MIN}` }).body.daily_limit_min, LIMIT_MIN);
  assert.deepEqual(controlsBody({ ...base, quietOn: true, quietStart: '21:00', quietEnd: '21:00' }).errors, ['quiet']);
  assert.deepEqual(controlsBody({ ...base, bedtime: '' }).errors, ['bedtime']);
});

test('changes are noticed against what was loaded, not against formatting', () => {
  const f = controlsForm({ ...LOADED, quiet_start: '20:30:00', quiet_end: '06:30:00' });
  assert.equal(controlsChanged(f, { ...LOADED, quiet_start: '20:30:00', quiet_end: '06:30:00' }), false);
  assert.equal(controlsChanged({ ...f, surprise: false }, LOADED), true);
  assert.equal(controlsChanged({ ...controlsForm(LOADED), limit: 'custom', customLimit: '' }, LOADED), true, 'a limit being typed keeps Save reachable');
  assert.equal(controlsChanged(null, LOADED), false);
});

test('the mood slider is clamped, banded and given a face', () => {
  assert.equal(clampMood('42'), 42);
  assert.equal(clampMood(-3), 0);
  assert.equal(clampMood(300), 100);
  assert.equal(clampMood('x'), 70);
  assert.deepEqual([90, 75, 55, 40, 10].map(moodBand), ['overjoyed', 'cheerful', 'ordinary', 'sluggish', 'low']);
  for (const n of [0, 34, 35, 50, 70, 85, 100]) assert.ok(EMOTIONS.includes(moodFace(n)), `face for ${n}`);
});

test('topics and goals are trimmed, deduplicated and capped', () => {
  assert.deepEqual(addEntry(['ghosts'], '  scary   movies ', { max: 3, maxLen: 60 }), ['ghosts', 'scary movies']);
  const same = ['Ghosts'];
  assert.equal(addEntry(same, 'ghosts', { max: 3, maxLen: 60 }), same, 'a duplicate returns the same list');
  assert.equal(addEntry(same, '   ', { max: 3, maxLen: 60 }), same);
  const full = Array.from({ length: TOPICS_MAX }, (_, i) => `t${i}`);
  assert.equal(addEntry(full, 'one more', { max: TOPICS_MAX, maxLen: 60 }), full);
  assert.equal(addEntry([], 'x'.repeat(80), { max: 5, maxLen: 60 })[0].length, 60);
  assert.deepEqual(removeEntry(['a', 'b'], 'a'), ['b']);
  assert.equal(goalKey('sharing'), 'careGoal_sharing');
  assert.equal(goalKey('tie shoelaces'), null);
});

test('a nudge waits from the start of its first day to the end of its last', () => {
  const start = new Date(dayStartIso('2026-11-02'));
  assert.deepEqual([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()], [2026, 10, 2, 0]);
  const end = new Date(dayEndIso('2026-11-03'));
  assert.deepEqual([end.getDate(), end.getHours(), end.getMinutes()], [3, 23, 59]);
  assert.equal(isoDay(dayEndIso('2026-11-03')), '2026-11-03');
  assert.equal(dayStartIso('soon'), null);
  assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05');
});

test('a nudge body checks its words and dates', () => {
  const today = '2026-10-30';
  assert.deepEqual(nudgeBody({ content: '  Grandma visits on Saturday ' }, today), { errors: [], body: { content: 'Grandma visits on Saturday' } });
  const dated = nudgeBody({ content: 'Zoo', after: '2026-11-01', until: '2026-11-02' }, today);
  assert.deepEqual(dated.errors, []);
  assert.equal(dated.body.use_after, dayStartIso('2026-11-01'));
  assert.equal(dated.body.expires_at, dayEndIso('2026-11-02'));
  assert.deepEqual(nudgeBody({ content: '' }, today).errors, ['content']);
  assert.deepEqual(nudgeBody({ content: 'x', until: '2026-10-29' }, today).errors, ['until'], 'already past');
  assert.deepEqual(nudgeBody({ content: 'x', after: '2026-11-05', until: '2026-11-02' }, today).errors, ['until'], 'ends before it starts');
  assert.equal(nudgeBody({ content: 'y'.repeat(400) }, today).body.content.length, 300);
  const rows = [{ id: 1, status: 'pending' }, { id: 2, status: 'used' }];
  assert.deepEqual(splitNudges(rows), { pending: [rows[0]], expired: [], used: [rows[1]] });
});

test('a pending nudge past its last day is listed apart as expired', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const rows = [
    { id: 'open', status: 'pending', expires_at: null },
    { id: 'past', status: 'pending', expires_at: '2026-10-29T16:59:59.999Z' },
    { id: 'edge', status: 'pending', expires_at: '2026-10-30T12:00:00Z' },
    { id: 'soon', status: 'pending', expires_at: '2026-10-30T12:00:01Z' },
    { id: 'said', status: 'used', expires_at: '2026-10-01T00:00:00Z' },
  ];
  const out = splitNudges(rows, now);
  assert.deepEqual(ids(out.pending), ['open', 'soon']);
  assert.deepEqual(ids(out.expired), ['past', 'edge'], 'the voice service only uses one while expires_at > now');
  assert.deepEqual(ids(out.used), ['said'], 'a used nudge stays used, whatever its last day');
  assert.deepEqual(ids(splitNudges(rows, now.getTime()).expired), ['past', 'edge'], 'a timestamp works as well as a Date');
  assert.deepEqual(ids(splitNudges(rows, new Date('2026-10-01T00:00:00Z')).expired), []);
  assert.deepEqual(splitNudges(null, now), { pending: [], expired: [], used: [] });
});

test('every key the Care page builds at runtime exists in both languages', () => {
  const keys = [
    ...CARE_TABS.map((x) => `careTab_${x}`),
    ...ALERT_KINDS.flatMap((x) => [`careCat_${x}`, `careTip_${x}`]),
    ...SUMMARY_GROUPS.map((x) => `careSum_${x}`),
    ...FACT_CATEGORIES.map((x) => `careFact_${x}`),
    ...FACT_SOURCES.map((x) => `careSource_${x}`),
    ...PERSON_KINDS.map((x) => `careKind_${x}`),
    ...EVENT_KINDS.map((x) => `careEvent_${x}`),
    ...RELATIONSHIP_KINDS.map((x) => `careRel_${x}`),
    ...TRAITS.flatMap((x) => ['high', 'low'].flatMap((s) => [`careTrait_${x}_${s}`, `careTraitDo_${x}_${s}`])),
    ...STAGES.map((x) => `careStage_${x}`),
    ...MOOD_BANDS.map((x) => `careMood_${x}`),
    ...GOAL_SUGGESTIONS.map(goalKey),
  ];
  const missing = keys.filter((k) => !(k in vi) || !(k in en));
  assert.deepEqual(missing, []);
});
