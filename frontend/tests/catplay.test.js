import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACT_MS, IDLE_ACTS, STROKE_PX, nextIdleAct, petFeeling } from '../src/lib/catplay.js';

test('every idle act has a duration, and the next one is never a repeat', () => {
  for (const act of IDLE_ACTS) assert.ok(ACT_MS[act] > 0, act);
  let last = null;
  const seq = [];
  for (let i = 0; i < 40; i += 1) {
    const next = nextIdleAct(() => (i * 0.37) % 1, last);
    assert.ok(IDLE_ACTS.includes(next.act));
    assert.notEqual(next.act, last);
    assert.equal(next.durationMs, ACT_MS[next.act]);
    assert.ok(next.afterMs >= 4000 && next.afterMs < 10000, `waits ${next.afterMs}`);
    seq.push(next.act);
    last = next.act;
  }
  assert.ok(new Set(seq).size > 1, 'more than one kind of move');
});

test('random at the edges still picks a real act', () => {
  assert.ok(IDLE_ACTS.includes(nextIdleAct(() => 0).act));
  assert.ok(IDLE_ACTS.includes(nextIdleAct(() => 0.999999).act));
  assert.ok(IDLE_ACTS.includes(nextIdleAct(() => 1).act));
});

test('a pat is happy, a stroke is love', () => {
  assert.equal(petFeeling(0), 'happy');
  assert.equal(petFeeling(STROKE_PX - 1), 'happy');
  assert.equal(petFeeling(STROKE_PX), 'love');
  assert.equal(petFeeling(5000), 'love');
});
