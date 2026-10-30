// Buddy's daily mood and the energy curve over the child's local day.

export type EnergyPhase = 'fresh' | 'normal' | 'drowsy';

// A stable pseudo-random number in [0, 1) per seed, so a mood holds all day.
export function seededUnit(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function dailyMood(seed: string, energyDial: number, valence: 'bright' | 'normal' | 'grey' | null): number {
  const base = 45 + energyDial * 0.25;
  const tilt = valence === 'bright' ? 10 : valence === 'grey' ? -12 : 0;
  const jitter = (seededUnit(seed) - 0.5) * 30;
  // Moods can be grey, but never so low that Buddy cannot comfort a child.
  return Math.round(Math.min(95, Math.max(20, base + tilt + jitter)));
}

export function moodWords(mood: number): string {
  if (mood >= 85) return 'overjoyed: fireworks inside, wants to try everything, talks a little faster';
  if (mood >= 70) return 'cheerful: laughs easily and finds everything interesting';
  if (mood >= 50) return 'ordinary: chatting at an easy pace';
  if (mood >= 35) return 'a bit sluggish: shorter sentences, slow to get excited';
  return 'a little sad: softer voice, but cheers up when something fun happens';
}

export function energyPhase(hour: number, minute: number, bedtime: string): EnergyPhase {
  const [bh, bm] = bedtime.split(':').map((n) => Number.parseInt(n, 10));
  const now = hour * 60 + minute;
  const bed = (bh || 20) * 60 + (bm || 0);
  if (now >= bed - 45 || hour < 6) return 'drowsy';
  if (hour < 10) return 'fresh';
  return 'normal';
}

export interface LocalTime {
  date: string;
  hour: number;
  minute: number;
  weekday: string;
}

export function localTime(timeZone: string, now: Date = new Date()): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday),
  };
}

export function ageInYears(birthDate: string | null, today: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 20 ? age : null;
}
