import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVad, VAD_DEFAULTS } from '../src/talk/vad.js';

const F = VAD_DEFAULTS.frameMs;
const QUIET = 0.003;

// Real speech: loud syllables with short dips between them.
const syllables = (loud = 0.12, dip = 0.01) => (t) => (t % 180 < 120 ? loud : dip);
const steady = (level) => () => level;

// Pushes `ms` of frames; returns every event with the time it happened.
function feed(vad, clock, level, ms) {
  const events = [];
  for (let t = 0; t < ms; t += F) {
    clock.t += F;
    const e = vad.push(level(t));
    if (e) events.push([e, clock.t]);
  }
  return events;
}

test('speech then a pause ends the turn after the silence window', () => {
  const vad = createVad();
  const clock = { t: 0 };
  assert.deepEqual(feed(vad, clock, steady(QUIET), 400), []);
  const speech = feed(vad, clock, syllables(), 1800);
  assert.deepEqual(speech.map(([e]) => e), ['speech']);
  const end = feed(vad, clock, steady(QUIET), 2000);
  assert.deepEqual(end.map(([e]) => e), ['end']);
  // The last loud frame of the speech is at 400 + 1740 (+20).
  assert.ok(end[0][1] - (400 + 1760) <= VAD_DEFAULTS.silenceMs + F, `ended at ${end[0][1]}`);
  assert.deepEqual(feed(vad, clock, syllables(), 500), [], 'nothing after the end');
});

test('a child who talks right on the tap is heard', () => {
  const vad = createVad();
  const clock = { t: 0 };
  const speech = feed(vad, clock, syllables(), 1500);
  assert.equal(speech[0]?.[0], 'speech');
  assert.equal(feed(vad, clock, steady(QUIET), 2000)[0]?.[0], 'end');
});

test('a thinking pause shorter than the window does not end the turn', () => {
  const vad = createVad();
  const clock = { t: 0 };
  feed(vad, clock, steady(QUIET), 300);
  feed(vad, clock, syllables(), 900);
  assert.deepEqual(feed(vad, clock, steady(QUIET), VAD_DEFAULTS.silenceMs - 200), []);
  assert.deepEqual(feed(vad, clock, syllables(), 600), []);
  assert.equal(feed(vad, clock, steady(QUIET), VAD_DEFAULTS.silenceMs + 100)[0][0], 'end');
});

test('a click is not speech, and silence alone gives the turn back', () => {
  const vad = createVad();
  const clock = { t: 0 };
  feed(vad, clock, steady(QUIET), 500);
  feed(vad, clock, steady(0.3), 60);
  const rest = feed(vad, clock, steady(QUIET), VAD_DEFAULTS.noSpeechMs);
  assert.equal(vad.heard, false);
  assert.deepEqual(rest.map(([e]) => e), ['no_speech']);
  assert.equal(rest[0][1], VAD_DEFAULTS.noSpeechMs);
});

test('a steady loud background becomes the floor, and speech over it still counts', () => {
  const vad = createVad({ noSpeechMs: 60_000 });
  const clock = { t: 0 };
  const hum = steady(0.04);
  assert.deepEqual(feed(vad, clock, hum, 3000), [], 'the hum alone is not speech');
  const speech = feed(vad, clock, syllables(0.3, 0.06), 1200);
  assert.equal(speech[0]?.[0], 'speech');
  assert.equal(feed(vad, clock, hum, 3000)[0]?.[0], 'end', 'the hum counts as silence after speech');
});

test('options override the defaults', () => {
  const vad = createVad({ silenceMs: 200, minSpeechMs: 40 });
  const clock = { t: 0 };
  feed(vad, clock, steady(QUIET), 200);
  feed(vad, clock, steady(0.12), 100);
  assert.equal(feed(vad, clock, steady(QUIET), 200)[0][0], 'end');
});
