import { isoDay } from './format.js';

const DAY = 86_400_000;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const sameDay = (a, b) => startOfDay(new Date(a).getTime()) === startOfDay(new Date(b).getTime());

// The last seven local days, oldest first: { start (local midnight), day
// (YYYY-MM-DD, the way backend-v2 writes dates), today }.
export function weekDays(now = Date.now()) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    // Stepping from today's midnight (not now - i days) keeps days whole
    // across daylight-saving changes.
    const start = startOfDay(startOfDay(now) - i * DAY + DAY / 2);
    days.push({ start, day: isoDay(new Date(start)), today: i === 0 });
  }
  return days;
}

// from and to for GET /children/:id/usage, covering the chart's seven days.
export function weekRange(now = Date.now()) {
  const days = weekDays(now);
  return { from: days[0].day, to: days[days.length - 1].day };
}

// Turns per day for the last seven days, oldest first (weekDays, each with
// n), from the GET /children/:id/usage rows of every child of the family:
// rows for the same day add up. The voice service counts each turn it
// records there, under the child's local date (a greeting Buddy starts
// itself too, which only happens while me.speak_first is on), so the week is
// whole however much the family talks, unlike GET /turns, which pages only
// the newest turns, and forgetting a child's memories leaves it as it was.
export function weekFromUsage(rows, now = Date.now()) {
  const days = weekDays(now).map((d) => ({ ...d, n: 0 }));
  for (const row of rows ?? []) {
    const slot = days.find((d) => d.day === row.day);
    if (slot) slot.n += Number(row.turns) || 0;
  }
  return days;
}

const isTurnDebit = (row) => row.kind === 'debit' && (row.reason ?? 'turn') === 'turn';

// The wallet has one debit per answered turn; a parent wants "Buddy answered
// 6 questions" per day. Consecutive turn debits on the same day collapse into
// one row, which keeps its child_id only while every debit in it was for the
// same child; everything else passes through. Input and output are newest
// first.
export function groupLedger(rows) {
  const out = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    if (isTurnDebit(row) && prev && isTurnDebit(prev) && sameDay(prev.created_at, row.created_at)) {
      prev.count += 1;
      prev.delta += row.delta;
      if (prev.child_id !== row.child_id) prev.child_id = null;
      continue;
    }
    out.push({ ...row, count: isTurnDebit(row) ? 1 : 0 });
  }
  return out;
}
