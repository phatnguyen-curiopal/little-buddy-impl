// Calendar helpers for histories written in each child's local time. The
// Los Angeles child crosses two DST changes in the year, so local-to-UTC is
// resolved per instant rather than with a fixed offset.

// The instant the replay stops and every test runs at: 08:00 on 30 October
// 2026 in Vietnam, 18:00 on 29 October in California.
export const HISTORY_END = new Date('2026-10-30T01:00:00Z');

function offsetMs(timeZone: string, at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(at)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

// 'YYYY-MM-DD HH:MM' in a time zone to the instant. Histories avoid the hour a
// DST jump skips, so a wall time there resolves to whichever side it lands on.
export function localToUtc(local: string, timeZone: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) throw new Error(`bad local time: ${local}`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let at = wall - offsetMs(timeZone, wall);
  at = wall - offsetMs(timeZone, at);
  return new Date(at);
}

export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 0 = Sunday, for a calendar date regardless of time zone.
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
