import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYBACK, createPlayer, createSchedule, startAt } from '../src/talk/player.js';

// backend-v2's downlink: 20 ms frames of 16 kHz PCM16, sent as fast as the
// voice is made, sentence by sentence.
const RATE = 16000;
const FRAME = 320;
const CHUNK = Math.round(PLAYBACK.chunkSec * RATE);
const frame = () => new Float32Array(FRAME).fill(0.25);
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const length = (b) => b.samples.length / RATE;

// Feeds a schedule frames at the given arrival times, firing its hold timer
// (the moment push said the gathered samples may wait until) whenever it
// comes first, as the player's setTimeout would. Returns every buffer with
// the moment it was handed to the audio clock.
function stream(schedule, arrivals) {
  const out = [];
  let holdAt = null;
  const take = (buffer, now) => {
    if (buffer) out.push({ ...buffer, at: now });
  };
  for (const now of arrivals) {
    if (holdAt !== null && holdAt <= now) {
      take(schedule.flush(holdAt), holdAt);
      holdAt = null;
    }
    const r = schedule.push(frame(), now);
    if (r.buffer) {
      take(r.buffer, now);
      holdAt = null;
    } else if (holdAt === null) {
      holdAt = now + r.wait;
    }
  }
  return { out, holdAt };
}

// Back to back: each buffer starts where the one before ends.
function assertSeamless(out) {
  for (let i = 1; i < out.length; i += 1) near(out[i].start, out[i - 1].start + length(out[i - 1]), `buffer ${i}`);
}

test('buffers of 100 to 200 ms, and a burst starts 150 to 250 ms ahead', () => {
  assert.ok(PLAYBACK.chunkSec >= 0.1 && PLAYBACK.chunkSec <= 0.2, 'chunk');
  assert.ok(PLAYBACK.leadSec >= 0.15 && PLAYBACK.leadSec <= 0.25, 'lead');
  assert.ok(PLAYBACK.leadSec >= PLAYBACK.chunkSec + PLAYBACK.lowWaterSec - 1e-9, 'a stream that only keeps pace fills whole buffers in time');
  assert.equal(startAt(5, 4), 5, 'sound still queued: right behind it');
  near(startAt(3, 4), 4 + PLAYBACK.leadSec, 'the queue ran dry: a lead from now');
  near(startAt(4, 4), 4 + PLAYBACK.leadSec, 'due this very moment is too late');
});

test('frames are joined into whole buffers, back to back, the first a lead ahead', () => {
  const s = createSchedule(RATE);
  for (let i = 0; i < 5; i += 1) {
    const r = s.push(frame(), 10);
    assert.equal(r.buffer, null, `frame ${i} waits for more`);
    near(r.wait, PLAYBACK.leadSec - PLAYBACK.lowWaterSec, `frame ${i} may wait`);
  }
  const first = s.push(frame(), 10).buffer;
  assert.equal(first.samples.length, CHUNK, 'six 20 ms frames, one 120 ms buffer');
  near(first.start, 10 + PLAYBACK.leadSec, 'start');
  assert.equal(first.samples[0], 0.25);

  let second = null;
  for (let i = 0; i < 6; i += 1) second = s.push(frame(), 10.05).buffer;
  near(second.start, first.start + PLAYBACK.chunkSec, 'right behind the first');
  near(s.end, 10 + PLAYBACK.leadSec + 2 * PLAYBACK.chunkSec, 'end');
  near(s.ahead(10.05), s.end - 10.05, 'ahead');
});

test('the end of a sentence goes out by itself once its time is nearly up', () => {
  const s = createSchedule(RATE);
  const r = s.push(frame(), 0);
  assert.equal(r.buffer, null);
  // The hold timer fires: the lone frame is scheduled at its moment.
  const lone = s.flush(r.wait);
  assert.equal(lone.samples.length, FRAME);
  near(lone.start, PLAYBACK.leadSec, 'start');
  assert.equal(s.flush(r.wait), null, 'nothing left to flush');
  // The next frame lands with little queued ahead of it; one more comes
  // too late to wait for company, so both go out at once, still seamless.
  const next = s.push(frame(), PLAYBACK.leadSec - 0.05);
  assert.equal(next.buffer, null);
  const both = s.push(frame(), PLAYBACK.leadSec - 0.03).buffer;
  assert.equal(both.samples.length, 2 * FRAME);
  near(both.start, lone.start + length(lone), 'start');
});

test('a frame after the queue ran dry starts a new burst, a lead ahead', () => {
  const s = createSchedule(RATE);
  for (let i = 0; i < 6; i += 1) s.push(frame(), 0);
  assert.ok(s.end < 1);
  const r = s.push(frame(), 1);
  assert.equal(r.buffer, null);
  near(r.wait, PLAYBACK.leadSec - PLAYBACK.lowWaterSec, 'wait');
  near(s.flush(1).start, 1 + PLAYBACK.leadSec, 'audio_end flushes it at the burst start');
});

test('audio_end sends the gathered tail right behind what is queued; stop drops it', () => {
  const s = createSchedule(RATE);
  for (let i = 0; i < 8; i += 1) s.push(frame(), 2);
  near(s.ahead(2), PLAYBACK.leadSec + (8 * FRAME) / RATE, 'ahead counts the gathered samples too');
  const tail = s.flush(2.01);
  assert.equal(tail.samples.length, 2 * FRAME);
  near(tail.start, 2 + PLAYBACK.leadSec + PLAYBACK.chunkSec, 'start');

  for (let i = 0; i < 3; i += 1) s.push(frame(), 2.02);
  s.reset();
  assert.equal(s.flush(2.03), null, 'nothing gathered survives a stop');
  assert.equal(s.ahead(2.03), 0);
  s.push(frame(), 2.04);
  near(s.flush(2.04).start, 2.04 + PLAYBACK.leadSec, 'the next answer starts afresh');
});

test('a stream that only keeps pace, each frame up to 80 ms late, plays without a gap', () => {
  // Frames are due every 20 ms; each lands up to 80 ms late, in order. One
  // 20 ms buffer per frame, 50 ms ahead (the player before), gaps here.
  let seed = 11;
  const late = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed / 2147483647) * 0.08;
  };
  const arrivals = [];
  for (let i = 0; i < 500; i += 1) arrivals.push(Math.max(arrivals.at(-1) ?? 0, 3 + i * 0.02 + late()));
  const s = createSchedule(RATE);
  const { out, holdAt } = stream(s, arrivals);
  const tail = s.flush(arrivals.at(-1) + 0.01);
  if (tail) out.push({ ...tail, at: arrivals.at(-1) + 0.01 });
  assert.ok(holdAt === null || tail, 'nothing is left behind');

  assert.equal(out.reduce((n, b) => n + b.samples.length, 0), 500 * FRAME, 'every sample played once');
  assertSeamless(out);
  for (const b of out) assert.ok(b.start - b.at >= PLAYBACK.lowWaterSec - 1e-9, 'scheduled in good time');
  assert.ok(out.length <= 500 / 4, `${out.length} buffers for 500 frames`);
});

test('a burst faster than speech fills whole buffers, then plays straight through', () => {
  // backend-v2 hands over each TTS chunk at once: 25 frames every 300 ms.
  const arrivals = [];
  for (let burst = 0; burst < 8; burst += 1) for (let i = 0; i < 25; i += 1) arrivals.push(1 + burst * 0.3);
  const s = createSchedule(RATE);
  const { out } = stream(s, arrivals);
  out.push({ ...s.flush(1 + 7 * 0.3), at: 1 + 7 * 0.3 });
  assertSeamless(out);
  near(out[0].start, 1 + PLAYBACK.leadSec, 'start');
  assert.ok(out.slice(0, -1).every((b) => b.samples.length === CHUNK), 'whole buffers, the tail aside');
  assert.equal(out.reduce((n, b) => n + b.samples.length, 0), 200 * FRAME);
});

test('other sample rates: the same 120 ms buffers', () => {
  const s = createSchedule(24000);
  let buffer = null;
  for (let i = 0; i < 6; i += 1) buffer = s.push(new Float32Array(480), 0).buffer;
  assert.equal(buffer.samples.length, 2880);
});

// Just enough of Web Audio for the player: the clock is moved by hand, and a
// source ends when the test says so.
class FakeContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
    this.sources = [];
    FakeContext.last = this;
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    this.state = 'closed';
    return Promise.resolve();
  }

  createBuffer(channels, size, rate) {
    const data = new Float32Array(size);
    return { length: size, sampleRate: rate, duration: size / rate, data, copyToChannel: (src) => data.set(src) };
  }

  createBufferSource() {
    const src = { buffer: null, at: null, stopped: false, onended: null, connect() {}, start(at) { this.at = at; }, stop() { this.stopped = true; } };
    this.sources.push(src);
    return src;
  }
}

function withAudio(t) {
  const saved = { window: globalThis.window, AudioContext: globalThis.AudioContext };
  globalThis.window = { AudioContext: FakeContext };
  globalThis.AudioContext = FakeContext;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
}

// One downlink frame's payload, PCM16 little-endian.
const bytes = () => new Uint8Array(FRAME * 2).fill(0x10);

test('the player schedules whole buffers, finishes after the last one, and says so once', (t) => {
  withAudio(t);
  let ended = 0;
  const player = createPlayer({ onEnded: () => { ended += 1; } });
  player.begin(RATE);
  const ctx = FakeContext.last;
  assert.equal(player.playing, true);

  for (let i = 0; i < 12; i += 1) player.push(bytes());
  assert.deepEqual(ctx.sources.map((s) => s.buffer.length), [CHUNK, CHUNK], 'twelve frames, two buffers');
  near(ctx.sources[0].at, PLAYBACK.leadSec, 'the burst starts a lead ahead');
  near(ctx.sources[1].at, PLAYBACK.leadSec + PLAYBACK.chunkSec, 'back to back');
  near(player.ahead, PLAYBACK.leadSec + 2 * PLAYBACK.chunkSec, 'ahead');

  // A short tail waits for company, then goes out on its own.
  player.push(bytes());
  assert.equal(ctx.sources.length, 2);
  t.mock.timers.tick(1000);
  assert.equal(ctx.sources.length, 3);
  assert.equal(ctx.sources[2].buffer.length, FRAME);
  near(ctx.sources[2].at, PLAYBACK.leadSec + 2 * PLAYBACK.chunkSec, 'right behind');

  // audio_end: the last frame goes at once, and the end comes after the
  // last buffer has played, however many times finish is called.
  player.push(bytes());
  player.finish();
  player.finish();
  assert.equal(ctx.sources.length, 4);
  for (const src of ctx.sources.slice(0, 3)) src.onended();
  assert.equal(ended, 0, 'one buffer still playing');
  ctx.sources[3].onended();
  assert.equal(ended, 1);
  assert.equal(player.playing, false);
  assert.equal(player.ahead, 0);
  t.mock.timers.tick(10_000);
  assert.equal(ended, 1, 'the safety timer does not say it twice');
});

test('stop is immediate: what plays stops, what is gathered is dropped, and no end is reported', (t) => {
  withAudio(t);
  let ended = 0;
  const player = createPlayer({ onEnded: () => { ended += 1; } });
  player.begin(RATE);
  const ctx = FakeContext.last;
  for (let i = 0; i < 8; i += 1) player.push(bytes());
  assert.equal(ctx.sources.length, 1);
  player.stop();
  assert.equal(ctx.sources[0].stopped, true);
  assert.equal(ctx.sources[0].onended, null);
  assert.equal(player.playing, false);
  t.mock.timers.tick(1000);
  assert.equal(ctx.sources.length, 1, 'the gathered frames never play');
  player.push(bytes());
  assert.equal(ctx.sources.length, 1, 'nothing plays until the next answer begins');
  assert.equal(ended, 0);

  // The next answer starts afresh, a lead from the context's now.
  ctx.currentTime = 5;
  player.begin(RATE);
  for (let i = 0; i < 6; i += 1) player.push(bytes());
  near(ctx.sources[1].at, 5 + PLAYBACK.leadSec, 'start');
});

test('a context the browser keeps suspended still ends the answer', (t) => {
  withAudio(t);
  let ended = 0;
  const player = createPlayer({ onEnded: () => { ended += 1; } });
  player.begin(RATE);
  const ctx = FakeContext.last;
  ctx.state = 'suspended';
  for (let i = 0; i < 7; i += 1) player.push(bytes());
  assert.equal(player.ahead, 0, 'nothing is heard while suspended');
  player.finish();
  assert.equal(ended, 0);
  t.mock.timers.tick(1500);
  assert.equal(ended, 1);
});
