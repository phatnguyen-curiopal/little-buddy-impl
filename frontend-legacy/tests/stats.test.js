import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekFromTurns, groupLedger, startOfDay } from '../src/lib/stats.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();

test('week has seven days ending today and counts only answered turns', () => {
  const now = new Date(2026, 8, 24, 15).getTime();
  const turns = [
    { status: 'completed', started_at: at(2026, 9, 24, 9) },
    { status: 'completed', started_at: at(2026, 9, 24, 0, 5) },
    { status: 'denied', started_at: at(2026, 9, 24, 10) },
    { status: 'completed', started_at: at(2026, 9, 23, 23) },
    { status: 'completed', started_at: at(2026, 9, 18) },
    { status: 'completed', started_at: at(2026, 9, 17) },
  ];
  const week = weekFromTurns(turns, now);
  assert.equal(week.length, 7);
  assert.equal(week[6].today, true);
  assert.equal(week[6].start, startOfDay(now));
  assert.deepEqual(week.map((d) => d.n), [1, 0, 0, 0, 0, 1, 2], 'the 17th is outside the window');
  assert.ok(week.every((d, i) => i === 0 || d.start > week[i - 1].start));
});

test('consecutive debits on one day collapse; other rows pass through', () => {
  const rows = [
    { id: 5, kind: 'debit', delta: -1, created_at: at(2026, 9, 24, 10) },
    { id: 4, kind: 'debit', delta: -1, created_at: at(2026, 9, 24, 9) },
    { id: 3, kind: 'purchase', delta: 20, created_at: at(2026, 9, 24, 8) },
    { id: 2, kind: 'debit', delta: -1, created_at: at(2026, 9, 23, 18) },
    { id: 1, kind: 'grant', delta: 10, reason: 'welcome', created_at: at(2026, 9, 20) },
  ];
  const grouped = groupLedger(rows);
  assert.deepEqual(grouped.map((r) => [r.kind, r.delta, r.count]), [['debit', -2, 2], ['purchase', 20, 0], ['debit', -1, 1], ['grant', 10, 0]]);
  assert.equal(rows[0].delta, -1, 'input rows are not mutated');
});

test('debits on different days stay separate even when adjacent', () => {
  const grouped = groupLedger([
    { id: 2, kind: 'debit', delta: -1, created_at: at(2026, 9, 24, 1) },
    { id: 1, kind: 'debit', delta: -1, created_at: at(2026, 9, 23, 23) },
  ]);
  assert.equal(grouped.length, 2);
});
