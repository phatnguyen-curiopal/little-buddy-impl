import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMOTIONS, parseEmotion } from '../../turn/emotion.js';

test('there are exactly the 14 emotions the face can draw', () => {
  assert.equal(EMOTIONS.length, 14);
});

test('a leading tag becomes the emotion and leaves the words', () => {
  assert.deepEqual(parseEmotion('[happy] Chào cậu!'), { emotion: 'happy', clean: 'Chào cậu!', tagged: true });
  assert.deepEqual(parseEmotion('  [Excited]Wow, a rainbow!'), { emotion: 'excited', clean: 'Wow, a rainbow!', tagged: true });
});

test('an unknown or missing tag falls back to neutral', () => {
  assert.equal(parseEmotion('[grumpy] Hừm.').emotion, 'neutral');
  assert.equal(parseEmotion('[grumpy] Hừm.').clean, 'Hừm.');
  assert.equal(parseEmotion('[grumpy] Hừm.').tagged, false);
  assert.deepEqual(parseEmotion('Không có thẻ.'), { emotion: 'neutral', clean: 'Không có thẻ.', tagged: false });
});

test('every other bracketed tag is stripped before TTS', () => {
  const { emotion, clean } = parseEmotion('[love] Tớ thương cậu [happy] lắm [cười]!');
  assert.equal(emotion, 'love');
  assert.equal(clean, 'Tớ thương cậu lắm!');
  assert.equal(parseEmotion('Ơ [sad] buồn quá').emotion, 'neutral');
});

test('a reply that is only a tag leaves nothing to say', () => {
  assert.equal(parseEmotion('[happy]').clean, '');
});
