// Every expression Buddy's screen can show. The backend emits a subset
// today (listening, happy, confused, sleepy); the rest are ready for the
// model's emotion header when the real pipeline lands.
export const EMOTIONS = [
  'neutral', 'listening', 'thinking', 'happy', 'excited', 'laughing', 'love',
  'curious', 'surprised', 'wink', 'shy', 'confused', 'sad', 'sleepy',
];

const KNOWN = new Set(EMOTIONS);

export function normalizeEmotion(value) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return KNOWN.has(v) ? v : 'neutral';
}

// Emotions whose eyes are round enough to follow the pointer.
export const LOOKING = new Set(['neutral', 'listening', 'curious', 'surprised', 'excited', 'love']);
