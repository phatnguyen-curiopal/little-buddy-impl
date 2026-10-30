// How Miu the kitten shows each feeling. Every expression is a handful of
// knobs on one drawing (components/Miu.jsx), so the 14 faces stay one
// character and changing feeling moves the parts instead of swapping
// pictures. Pure, so tests check that every emotion has a pose.
import { EMOTIONS, normalizeEmotion } from './emotions.js';

// Brows and mouths in the 400 x 440 drawing; the eyes sit at x 152 and 248.
export const BROWS = {
  calm: ['M128 122 Q 150 114 172 120', 'M228 120 Q 250 114 272 122'],
  up: ['M128 108 Q 150 98 172 106', 'M228 106 Q 250 98 272 108'],
  sad: ['M128 120 Q 152 116 172 106', 'M228 106 Q 248 116 272 120'],
  focus: ['M128 118 Q 150 114 172 120', 'M228 110 Q 250 100 272 108'],
  tilt: ['M128 112 Q 150 104 172 112', 'M228 122 Q 250 120 272 126'],
};

export const MOUTH_LINES = {
  w: 'M184 224 Q 192 236 200 226 Q 208 236 216 224',
  small: 'M190 230 Q 200 237 210 230',
  flat: 'M192 236 Q 204 233 216 236',
  frown: 'M184 242 Q 200 228 216 242',
  wavy: 'M182 238 Q 191 231 200 238 Q 209 245 218 238',
  smirk: 'M184 230 Q 204 246 222 228',
};

// An open mouth and where its tongue sits (0: no tongue).
export const MOUTH_FILLS = {
  smile: ['M176 226 Q 200 266 224 226 Q 200 234 176 226 Z', 240],
  laugh: ['M166 224 Q 200 286 234 224 Q 200 234 166 224 Z', 246],
  o: ['M188 229 a 12 15 0 1 0 24 0 a 12 15 0 1 0 -24 0 Z', 0],
  tiny: ['M194 233 a 6 7 0 1 0 12 0 a 6 7 0 1 0 -12 0 Z', 0],
};

const BASE = Object.freeze({
  eyes: 'open', lx: 0, ly: 0, pupil: 14, wide: false, brow: 'calm', line: 'w', fill: null,
  ear: [0, 0], arm: [15, -15], blush: 0, extra: null,
});

// eyes: open | happy (closed arcs) | closed (asleep) | heart | wink
// ear / arm: rotation in degrees, left then right (a positive left arm swings out)
// extra: waves | dots | sparkle | love | question | tear | zzz
const POSES = {
  neutral: {},
  listening: { brow: 'up', line: 'small', ear: [-8, 8], arm: [15, -150], extra: 'waves' },
  thinking: { lx: 8, ly: -10, brow: 'focus', line: 'flat', arm: [-35, -15], extra: 'dots' },
  happy: { eyes: 'happy', line: null, fill: 'smile', blush: 0.7, arm: [25, -25] },
  excited: { pupil: 12, brow: 'up', line: null, fill: 'laugh', arm: [150, -150], extra: 'sparkle', blush: 0.5 },
  laughing: { eyes: 'happy', line: null, fill: 'laugh', blush: 0.8, arm: [30, -30], ear: [6, -6] },
  love: { eyes: 'heart', line: null, fill: 'smile', blush: 0.9, arm: [-30, 30], extra: 'love' },
  curious: { lx: 10, brow: 'tilt', line: null, fill: 'tiny', ear: [-12, 4], extra: 'question' },
  surprised: { pupil: 9, wide: true, brow: 'up', line: null, fill: 'o', arm: [40, -40] },
  wink: { eyes: 'wink', line: 'smirk', arm: [15, -140], extra: 'sparkle', blush: 0.4 },
  shy: { eyes: 'happy', ly: 6, line: 'small', blush: 1, arm: [-35, 35], ear: [-10, 10] },
  confused: { lx: -6, ly: 4, brow: 'tilt', line: 'wavy', ear: [-20, 5], arm: [15, -160], extra: 'question' },
  sad: { ly: 8, brow: 'sad', line: 'frown', ear: [-30, 30], arm: [5, -5], extra: 'tear' },
  sleepy: { eyes: 'closed', line: null, fill: 'tiny', ear: [-15, 15], arm: [8, -8], extra: 'zzz' },
};

// Feelings whose eyes are open and round enough to follow the pointer.
const LOOKS_AROUND = new Set(['neutral', 'listening', 'curious', 'surprised', 'excited']);

export function miuPose(emotion) {
  const e = normalizeEmotion(emotion);
  return { emotion: e, followsPointer: LOOKS_AROUND.has(e), ...BASE, ...POSES[e] };
}

export const POSED = EMOTIONS.filter((e) => e in POSES);
