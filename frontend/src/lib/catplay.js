// What makes Miu feel like a cat on the Talk screen, as pure rules so the
// hooks in motion.js stay thin and the timings are tested.

// Miu's own little moves while nothing happens, like a cat on a sofa.
// Each one is a CSS animation on the figure (styles/miu.css, miu-act-*).
export const IDLE_ACTS = Object.freeze(['ear', 'tilt', 'swish', 'hop', 'stretch']);
export const ACT_MS = Object.freeze({ ear: 600, tilt: 1400, swish: 1600, hop: 700, stretch: 1600 });
const ACT_GAP_MIN_MS = 4000;
const ACT_GAP_SPREAD_MS = 6000;

// Picks the next act, never the same twice in a row, and how long to wait
// for it. random is injected so tests can drive it.
export function nextIdleAct(random, last = null) {
  const pool = IDLE_ACTS.filter((a) => a !== last);
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  const act = pool[index];
  return { act, durationMs: ACT_MS[act], afterMs: ACT_GAP_MIN_MS + Math.floor(random() * ACT_GAP_SPREAD_MS) };
}

// Petting: a pat is a press, a cuddle is a stroke across the fur. The
// distance is how far the pointer travelled while pressed, in CSS pixels.
export const STROKE_PX = 140;
export function petFeeling(distancePx) {
  return distancePx >= STROKE_PX ? 'love' : 'happy';
}
// The warm feeling lingers a moment after the hand lifts.
export const PET_LINGER_MS = 1200;

// With nothing to do for this long, Miu dozes off; any touch or word
// wakes it with a start.
export const DOZE_MS = 90_000;
export const STARTLE_MS = 900;
