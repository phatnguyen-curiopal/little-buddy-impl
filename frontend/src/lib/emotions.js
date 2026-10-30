// Every expression Buddy's screen can show. backend-v2 tags each answer with
// a face (the turn's `face`, and the toy socket's face messages).
export const EMOTIONS = [
  'neutral', 'listening', 'thinking', 'happy', 'excited', 'laughing', 'love',
  'curious', 'surprised', 'wink', 'shy', 'confused', 'sad', 'sleepy',
];

const KNOWN = new Set(EMOTIONS);

// Faces backend-v2 can send that the drawings do not have, each shown as the
// nearest one they do. A Map, so a value such as "constructor" cannot reach
// an inherited property.
const NEAREST = new Map([['proud', 'happy'], ['worried', 'sad'], ['calm', 'neutral']]);

export function normalizeEmotion(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (KNOWN.has(v)) return v;
  return NEAREST.get(v) ?? 'neutral';
}

// Emotions whose eyes are round enough to follow the pointer.
export const LOOKING = new Set(['neutral', 'listening', 'curious', 'surprised', 'excited', 'love']);
