// The model tags its own emotion: the reply opens with "[happy]" and the
// like. The face gets the tag, the speech engine gets the words.

export const EMOTIONS = Object.freeze([
  'neutral', 'listening', 'thinking', 'happy', 'excited', 'laughing', 'love',
  'curious', 'surprised', 'wink', 'shy', 'confused', 'sad', 'sleepy',
]);

const LEADING_TAG = /^\s*\[([^\]\n]{1,32})\]/;
// Any other bracketed aside would be read aloud verbatim ("happy" in the
// middle of a sentence), so every one of them goes before TTS.
const ANY_TAG = /\[[^\]\n]{0,40}\]/g;

export function parseEmotion(raw) {
  const text = String(raw ?? '');
  const match = text.match(LEADING_TAG);
  const tag = match ? match[1].trim().toLowerCase() : '';
  const emotion = EMOTIONS.includes(tag) ? tag : 'neutral';
  const clean = text
    .replace(LEADING_TAG, '')
    .replace(ANY_TAG, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([.,!?])/g, '$1')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  // tagged is false when the model dropped or garbled the tag, so the
  // neutral face was a fallback and not a choice; run_turn logs it.
  return { emotion, clean, tagged: EMOTIONS.includes(tag) };
}
