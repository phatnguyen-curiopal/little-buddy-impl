import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekDays, weekRange, weekFromUsage, groupLedger, startOfDay } from '../src/lib/stats.js';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

test('the week is the last seven local days, oldest first, named as backend-v2 names days', () => {
  const now = new Date(2026, 8, 24, 15).getTime();
  const week = weekDays(now);
  assert.deepEqual(week.map((d) => d.day), ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
  assert.deepEqual(week.map((d) => d.today), [false, false, false, false, false, false, true]);
  assert.equal(week[6].start, startOfDay(now));
  assert.ok(week.every((d, i) => i === 0 || d.start > week[i - 1].start));
  assert.deepEqual(weekRange(now), { from: '2026-09-18', to: '2026-09-24' });
});

test('the week crosses a month and a year end on whole days', () => {
  assert.deepEqual(weekRange(new Date(2027, 0, 2, 0, 1).getTime()), { from: '2026-12-27', to: '2027-01-02' });
  assert.deepEqual(weekRange(new Date(2026, 2, 3, 23, 59).getTime()), { from: '2026-02-25', to: '2026-03-03' });
});

// Rows as GET /children/:id/usage sends them, one per child per day talked.
const usage = (day, turns) => ({ day, turns, talk_minutes: turns / 2 });

test("the week adds up every child's turns per day", () => {
  const now = new Date(2026, 8, 24, 15).getTime();
  const first = [usage('2026-09-17', 40), usage('2026-09-18', 3), usage('2026-09-23', 150), usage('2026-09-24', 90)];
  const second = [usage('2026-09-18', 2), usage('2026-09-24', 70)];
  const week = weekFromUsage([...first, ...second], now);
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((d) => d.n), [5, 0, 0, 0, 0, 150, 160], 'the 17th is outside the window');
  assert.equal(week[6].today, true);
});

test('a week with no rows is seven zero days', () => {
  const now = new Date(2026, 8, 24, 15).getTime();
  assert.deepEqual(weekFromUsage([], now).map((d) => d.n), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(weekFromUsage(undefined, now).map((d) => d.n), [0, 0, 0, 0, 0, 0, 0]);
});

const debit = (id, created_at, child_id = 'c1') => ({ id, kind: 'debit', delta: -1, reason: 'turn', child_id, turn_id: `t${id}`, purchase_id: null, created_at });

test('consecutive turn debits on one day collapse; other rows pass through', () => {
  const rows = [
    debit(5, at(2026, 9, 24, 10)),
    debit(4, at(2026, 9, 24, 9)),
    { id: 3, kind: 'purchase', delta: 20, reason: 'pack:starter', child_id: null, turn_id: null, purchase_id: 'p1', created_at: at(2026, 9, 24, 8) },
    debit(2, at(2026, 9, 23, 18)),
    { id: 1, kind: 'grant', delta: 1000, reason: 'welcome', child_id: null, turn_id: null, purchase_id: null, created_at: at(2026, 9, 20) },
  ];
  const grouped = groupLedger(rows);
  assert.deepEqual(grouped.map((r) => [r.kind, r.delta, r.count]), [['debit', -2, 2], ['purchase', 20, 0], ['debit', -1, 1], ['grant', 1000, 0]]);
  assert.equal(rows[0].delta, -1, 'input rows are not mutated');
});

test('a run keeps its child only while every answer in it was for that child', () => {
  const one = groupLedger([debit(3, at(2026, 9, 24, 10)), debit(2, at(2026, 9, 24, 9)), debit(1, at(2026, 9, 24, 8))]);
  assert.equal(one.length, 1);
  assert.equal(one[0].child_id, 'c1');
  const mixed = groupLedger([debit(3, at(2026, 9, 24, 10)), debit(2, at(2026, 9, 24, 9), 'c2'), debit(1, at(2026, 9, 24, 8))]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].count, 3);
  assert.equal(mixed[0].child_id, null, 'answers for two children name no child');
});

test('debits on different days stay separate even when adjacent', () => {
  const grouped = groupLedger([debit(2, at(2026, 9, 24, 1)), debit(1, at(2026, 9, 23, 23))]);
  assert.equal(grouped.length, 2);
});
