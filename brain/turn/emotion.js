// The model tags its own emotion: the reply opens with "[happy]" and the
// like. The face gets the tag, the speech engine gets the words, plus the
// voice tags ("[whispers]") when its model can perform them.

export const EMOTIONS = Object.freeze([
  'neutral', 'listening', 'thinking', 'happy', 'excited', 'laughing', 'love',
  'curious', 'surprised', 'wink', 'shy', 'confused', 'sad', 'sleepy',
]);

// The only voice tags that reach TTS, the same list the prompt gives the
// model. Each was checked on every Buddy voice in both languages (none was
// read aloud); shouting, crying, accents and sound effects are left out on
// purpose, so a tag the model invents can never become a [gunshot].
export const VOICE_TAGS = Object.freeze([
  'excited', 'playful', 'curious', 'amazed', 'proud', 'thoughtful', 'sympathetic',
  'softly', 'whispers', 'slowly', 'speedy', 'pause', 'laughs', 'giggles', 'gasps',
]);

const LEADING_TAG = /^\s*\[([^\]\n]{1,32})\]/;
// Any other bracketed aside would be read aloud verbatim ("happy" in the
// middle of a sentence), so every one of them goes before TTS.
const ANY_TAG = /\[([^\]\n]{0,40})\]/g;

function tidy(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([.,!?])/g, '$1')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export function parseEmotion(raw, { audioTags = false } = {}) {
  const text = String(raw ?? '');
  const match = text.match(LEADING_TAG);
  const tag = match ? match[1].trim().toLowerCase() : '';
  const emotion = EMOTIONS.includes(tag) ? tag : 'neutral';
  const body = text.replace(LEADING_TAG, '');
  const clean = tidy(body.replace(ANY_TAG, ' '));
  let voiceTags = 0;
  // The display text, memory and the backend get `clean`; only the speech
  // engine hears the voice tags.
  const spoken = audioTags
    ? tidy(
        body.replace(ANY_TAG, (_, inner) => {
          const voice = inner.trim().toLowerCase();
          if (!VOICE_TAGS.includes(voice)) return ' ';
          voiceTags += 1;
          return ` [${voice}] `;
        }),
      )
    : clean;
  // tagged is false when the model dropped or garbled the tag, so the
  // neutral face was a fallback and not a choice; run_turn logs it.
  return { emotion, clean, spoken, tagged: EMOTIONS.includes(tag), voiceTags };
}
