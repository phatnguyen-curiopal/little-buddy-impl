// The model tags its own emotion: the reply opens with "[happy]" and the
// like. The face gets the tag, the speech engine gets the words, plus the
// voice tags ("[whispers]") when its model can perform them.

export const EMOTIONS = Object.freeze([
  'neutral', 'listening', 'thinking', 'happy', 'excited', 'laughing', 'love',
  'curious', 'surprised', 'wink', 'shy', 'confused', 'sad', 'sleepy',
]);

const LEADING_TAG = /^\s*\[([^\]\n]{1,32})\]/;
// Voice tags are free text ("[speeding up, like a sports commentator]"), so
// the limit is generous: a longer bracket would survive into the reply text.
const ANY_TAG = /\[([^\]\n]{0,80})\]/g;

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
  const tagged = EMOTIONS.includes(tag);
  const emotion = tagged ? tag : 'neutral';
  // The display text, memory and the backend never carry a tag: any other
  // bracketed aside would be read aloud verbatim by a model without tags.
  const clean = tidy(text.replace(LEADING_TAG, '').replace(ANY_TAG, ' '));
  if (!audioTags) return { emotion, clean, spoken: clean, tagged, voiceTags: 0 };

  // Every tag the model wrote reaches the speech engine except the face tag;
  // a leading tag that is not a face is a voice tag the model put first.
  let voiceTags = 0;
  const body = tagged ? text.replace(LEADING_TAG, '') : text;
  const spoken = tidy(
    body.replace(ANY_TAG, (_, inner) => {
      const voice = inner.trim();
      if (!voice) return ' ';
      voiceTags += 1;
      return ` [${voice}] `;
    }),
  );
  // tagged is false when the model dropped or garbled the tag, so the
  // neutral face was a fallback and not a choice; run_turn logs it.
  return { emotion, clean, spoken, tagged, voiceTags };
}
