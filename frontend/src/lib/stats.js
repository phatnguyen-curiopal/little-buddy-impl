const DAY = 86_400_000;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Answered turns per local day for the last seven days, oldest first. Built
// from /api/turns so the dashboard needs no aggregate endpoint.
export function weekFromTurns(turns, now = Date.now()) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    // Stepping from today's midnight (not now - i days) keeps days whole
    // across daylight-saving changes.
    const start = startOfDay(startOfDay(now) - i * DAY + DAY / 2);
    days.push({ start, n: 0, today: i === 0 });
  }
  for (const turn of turns) {
    if (turn.status !== 'completed') continue;
    const day = startOfDay(new Date(turn.started_at).getTime());
    const slot = days.find((d) => d.start === day);
    if (slot) slot.n += 1;
  }
  return days;
}

// The wallet returns one row per answer; a parent wants "Buddy answered 6
// questions" per day. Consecutive debits on the same day collapse into one
// row; everything else passes through. Input and output are newest first.
export function groupLedger(rows) {
  const out = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    if (row.kind === 'debit' && prev?.kind === 'debit' && startOfDay(new Date(prev.created_at).getTime()) === startOfDay(new Date(row.created_at).getTime())) {
      prev.count += 1;
      prev.delta += row.delta;
      continue;
    }
    out.push({ ...row, count: row.kind === 'debit' ? 1 : 0 });
  }
  return out;
}
