// The 16 personality types a parent can pick for a Buddy (ENFP and so on).
// A type is a shorthand for the five dials, so the brief needs nothing new:
// each letter pushes one dial, and the character's ranges keep Bo still Bo.

import { DIAL_KEYS, type Dials } from './packs.ts';

export const PERSONALITY_RE = /^[EI][NS][FT][JP]$/;

export function dialsForType(code: string, ranges: Record<keyof Dials, [number, number]>): Dials {
  const target: Dials = {
    energy: code[0] === 'E' ? 85 : 35,
    curiosity: code[1] === 'N' ? 85 : 50,
    warmth: code[2] === 'F' ? 90 : 55,
    structure: code[3] === 'J' ? 75 : 30,
    playfulness: code[3] === 'P' ? 85 : 50,
  };
  const out = { ...target };
  for (const k of DIAL_KEYS) {
    const [lo, hi] = ranges[k] ?? [0, 100];
    out[k] = Math.min(hi, Math.max(lo, target[k]));
  }
  return out;
}
