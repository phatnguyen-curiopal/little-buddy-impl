// Every expression Buddy's screen can show. With the brain, the model tags
// each answer with one of these; the mock pipeline emits only listening,
// happy, confused and sleepy.
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
