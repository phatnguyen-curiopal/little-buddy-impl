import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMOTIONS, VOICE_TAGS, parseEmotion } from '../../turn/emotion.js';

test('there are exactly the 14 emotions the face can draw', () => {
  assert.equal(EMOTIONS.length, 14);
});

test('a leading tag becomes the emotion and leaves the words', () => {
  assert.deepEqual(parseEmotion('[happy] Chào cậu!'), {
    emotion: 'happy',
    clean: 'Chào cậu!',
    spoken: 'Chào cậu!',
    tagged: true,
    voiceTags: 0,
  });
  assert.equal(parseEmotion('  [Excited]Wow, a rainbow!').emotion, 'excited');
  assert.equal(parseEmotion('  [Excited]Wow, a rainbow!').clean, 'Wow, a rainbow!');
});

test('an unknown or missing tag falls back to neutral', () => {
  assert.equal(parseEmotion('[grumpy] Hừm.').emotion, 'neutral');
  assert.equal(parseEmotion('[grumpy] Hừm.').clean, 'Hừm.');
  assert.equal(parseEmotion('[grumpy] Hừm.').tagged, false);
  const none = parseEmotion('Không có thẻ.');
  assert.equal(none.emotion, 'neutral');
  assert.equal(none.clean, 'Không có thẻ.');
  assert.equal(none.tagged, false);
});

test('without audio tags every other bracketed tag is stripped before TTS', () => {
  const { emotion, clean, spoken, voiceTags } = parseEmotion('[love] Tớ thương cậu [whispers] lắm [cười]!');
  assert.equal(emotion, 'love');
  assert.equal(clean, 'Tớ thương cậu lắm!');
  assert.equal(spoken, clean);
  assert.equal(voiceTags, 0);
  assert.equal(parseEmotion('Ơ [sad] buồn quá').emotion, 'neutral');
});

test('with audio tags only the listed voice tags reach the speech engine', () => {
  const reply = '[happy] [Giggles] Hay quá![whispers]Bí mật nè [grumpy]. [ laughs ] [explosion]';
  const { emotion, clean, spoken, tagged, voiceTags } = parseEmotion(reply, { audioTags: true });
  assert.equal(emotion, 'happy');
  assert.equal(tagged, true);
  // The display text and memory never carry a tag.
  assert.equal(clean, 'Hay quá! Bí mật nè.');
  // Kept tags are lowercased and spaced; the face tag, invented tags and
  // sound effects are gone.
  assert.equal(spoken, '[giggles] Hay quá! [whispers] Bí mật nè. [laughs]');
  assert.equal(voiceTags, 3);
});

test('a face tag that is also a voice word stays the face, never the voice', () => {
  const { emotion, spoken, voiceTags } = parseEmotion('[excited] Wow! [excited] Again!', { audioTags: true });
  assert.equal(emotion, 'excited');
  assert.equal(spoken, 'Wow! [excited] Again!');
  assert.equal(voiceTags, 1);
});

test('a reply with no voice tag counts zero, so run_turn can log it', () => {
  assert.equal(parseEmotion('[happy] Chào cậu!', { audioTags: true }).voiceTags, 0);
});

test('the voice tags are a frozen list of lowercase words', () => {
  assert.equal(VOICE_TAGS.length, 15);
  for (const tag of VOICE_TAGS) assert.match(tag, /^[a-z]+$/);
  assert.ok(Object.isFrozen(VOICE_TAGS));
});

test('a reply that is only a tag leaves nothing to say', () => {
  assert.equal(parseEmotion('[happy]').clean, '');
  assert.equal(parseEmotion('[happy] [giggles]', { audioTags: true }).clean, '');
});
