import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Downsampler, FrameChunker, FRAME_BYTES, FRAME_SAMPLES, OUT_RATE, frameRms, levelFromRms, pcm16ToFloat32, workletSource } from '../src/talk/dsp.js';

const sine = (freq, rate, seconds, amp = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate));

// Feeds the input in 128-sample blocks, the AudioWorklet render quantum.
function run(ds, input) {
  const parts = [];
  for (let i = 0; i < input.length; i += 128) parts.push(ds.process(input.subarray(i, i + 128)));
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// Zero crossings per second, a cheap frequency estimate.
function frequency(samples, rate) {
  let crossings = 0;
  for (let i = 1; i < samples.length; i += 1) if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings += 1;
  return crossings / 2 / (samples.length / rate);
}

const rmsOf = (samples) => frameRms(samples);

test('48 kHz becomes 16 kHz with the length and pitch preserved', () => {
  const out = run(new Downsampler(48000, OUT_RATE), sine(440, 48000, 1));
  assert.ok(Math.abs(out.length - 16000) <= 2, `length ${out.length}`);
  const f = frequency(out.subarray(1600), OUT_RATE);
  assert.ok(Math.abs(f - 440) < 5, `frequency ${f}`);
  assert.ok(rmsOf(out.subarray(1600)) > 0.3, 'speech-band tone passes at nearly full level');
});

test('44.1 kHz input (a fractional ratio) resamples seamlessly across blocks', () => {
  const out = run(new Downsampler(44100, OUT_RATE), sine(1000, 44100, 2));
  assert.ok(Math.abs(out.length - 32000) <= 2, `length ${out.length}`);
  const f = frequency(out.subarray(3200), OUT_RATE);
  assert.ok(Math.abs(f - 1000) < 8, `frequency ${f}`);
  // A seam between blocks would show up as a jump far bigger than a
  // 1 kHz tone ever moves between two samples at 16 kHz.
  const maxStep = 0.5 * 32767 * 2 * Math.sin((Math.PI * 1000) / OUT_RATE) * 1.05;
  for (let i = 3201; i < out.length; i += 1) assert.ok(Math.abs(out[i] - out[i - 1]) <= maxStep, `jump at ${i}`);
});

test('content above the new Nyquist is filtered out instead of folding back', () => {
  const tone = run(new Downsampler(48000, OUT_RATE), sine(12000, 48000, 1));
  assert.ok(rmsOf(tone.subarray(1600)) < 0.02, `12 kHz leaked at rms ${rmsOf(tone.subarray(1600))}`);
});

test('output is clamped to Int16', () => {
  const out = run(new Downsampler(16000, OUT_RATE), Float32Array.from([2, -2, 0.5]));
  assert.deepEqual([...out], [32767, -32767, 16384]);
});

test('frames are exactly 640 bytes and nothing is lost between calls', () => {
  assert.equal(FRAME_BYTES, 640);
  const chunker = new FrameChunker(FRAME_SAMPLES);
  const frames = [];
  let next = 0;
  for (const size of [100, 300, 7, 500, 373]) {
    const block = Int16Array.from({ length: size }, () => next++);
    frames.push(...chunker.push(block));
  }
  assert.equal(frames.length, Math.floor(1280 / FRAME_SAMPLES));
  frames.forEach((f, k) => {
    assert.equal(f.byteLength, FRAME_BYTES);
    assert.equal(f[0], k * FRAME_SAMPLES);
    assert.equal(f[FRAME_SAMPLES - 1], (k + 1) * FRAME_SAMPLES - 1);
  });
});

test('loudness helpers', () => {
  assert.equal(frameRms(new Int16Array(320)), 0);
  assert.ok(Math.abs(frameRms(new Int16Array(320).fill(16384)) - 0.5) < 1e-9);
  assert.equal(levelFromRms(0), 0);
  assert.equal(levelFromRms(1), 1);
  assert.ok(levelFromRms(0.05) > 0.3 && levelFromRms(0.05) < 0.9);
});

test('PCM16 little-endian bytes decode to floats and an odd byte is ignored', () => {
  const bytes = new Uint8Array([0x00, 0x40, 0x00, 0xC0, 0xFF, 0x7F, 0x12]);
  const out = pcm16ToFloat32(bytes);
  assert.equal(out.length, 3);
  assert.equal(out[0], 0.5);
  assert.equal(out[1], -0.5);
  assert.ok(Math.abs(out[2] - 32767 / 32768) < 1e-9);
  assert.equal(pcm16ToFloat32(new ArrayBuffer(4)).length, 2);
});

test('the worklet module runs on its own and posts 640-byte frames', () => {
  let Processor = null;
  class FakeBase {
    constructor() {
      this.port = { sent: [], postMessage(msg, transfer) { this.sent.push({ msg, transfer }); } };
    }
  }
  const load = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', workletSource());
  load(FakeBase, (name, cls) => {
    assert.equal(name, 'lb-mic');
    Processor = cls;
  }, 48000);
  const node = new Processor();
  const input = sine(300, 48000, 0.5, 0.3);
  for (let i = 0; i < input.length; i += 128) assert.equal(node.process([[input.subarray(i, i + 128)]]), true);
  assert.equal(node.process([[]]), true, 'an empty input keeps the node alive');
  const sent = node.port.sent;
  assert.equal(sent.length, Math.floor(8000 / FRAME_SAMPLES));
  for (const { msg, transfer } of sent) {
    assert.equal(msg.frame.byteLength, FRAME_BYTES);
    assert.deepEqual(transfer, [msg.frame]);
    assert.ok(msg.rms >= 0 && msg.rms < 1);
  }
});
