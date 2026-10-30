import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOTIONS } from '../src/lib/emotions.js';
import { BROWS, MOUTH_FILLS, MOUTH_LINES, POSED, miuPose } from '../src/lib/miu.js';

test('Miu has a pose for every feeling the brain can send', () => {
  assert.deepEqual(POSED, EMOTIONS);
});

test('every pose names parts the drawing has', () => {
  const eyes = new Set(['open', 'happy', 'closed', 'heart', 'wink']);
  const extras = new Set([null, 'waves', 'dots', 'sparkle', 'love', 'question', 'tear', 'zzz']);
  for (const e of EMOTIONS) {
    const p = miuPose(e);
    assert.ok(eyes.has(p.eyes), `${e}: eyes ${p.eyes}`);
    assert.ok(p.brow in BROWS, `${e}: brow ${p.brow}`);
    assert.ok(extras.has(p.extra), `${e}: extra ${p.extra}`);
    // A face always has a mouth: a line, an open mouth, never both or neither.
    assert.ok(Boolean(p.line) !== Boolean(p.fill), `${e}: one mouth`);
    if (p.line) assert.ok(p.line in MOUTH_LINES, `${e}: line ${p.line}`);
    if (p.fill) assert.ok(p.fill in MOUTH_FILLS, `${e}: fill ${p.fill}`);
    assert.equal(p.ear.length, 2);
    assert.equal(p.arm.length, 2);
    assert.ok(p.blush >= 0 && p.blush <= 1);
  }
});

test('an unknown feeling is the calm face', () => {
  assert.equal(miuPose('grumpy').emotion, 'neutral');
  assert.equal(miuPose(undefined).eyes, 'open');
  assert.equal(miuPose('SLEEPY').eyes, 'closed');
});
