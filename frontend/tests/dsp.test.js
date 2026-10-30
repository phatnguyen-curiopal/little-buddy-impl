import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWNLINK, Downsampler, FRAME_BYTES, FRAME_SAMPLES, FRAME_VERSION, FrameChunker, HEADER_BYTES, OUT_RATE, UPLINK,
  decodeFrame, encodeFrame, frameRms, levelFromRms, pcm16ToFloat32, workletSource,
} from '../src/talk/dsp.js';
import { FRAME_MS, TURN_CAP_FRAMES, TURN_MAX_SEC } from '../src/talk/mic.js';

// backend-v2's own frame code, when this Node can load TypeScript.
const backend = await import('../../backend-v2/src/audio/frames.ts').catch(() => null);

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

test('an uplink frame is the 4-byte header, then the 640 bytes as they came', () => {
  const pcm = Int16Array.from({ length: FRAME_SAMPLES }, (_, i) => (i % 2 ? -i : i) * 97);
  const out = new Uint8Array(encodeFrame(0x1234, pcm.buffer));
  assert.equal(out.byteLength, HEADER_BYTES + FRAME_BYTES);
  assert.deepEqual([...out.subarray(0, HEADER_BYTES)], [FRAME_VERSION, UPLINK, 0x12, 0x34], 'version, direction, sequence big-endian');
  const view = new DataView(out.buffer, HEADER_BYTES);
  for (let i = 0; i < FRAME_SAMPLES; i += 1) assert.equal(view.getInt16(i * 2, true), pcm[i], `sample ${i} little-endian`);
  assert.deepEqual([...new Uint8Array(encodeFrame(0x1_0005, new Uint8Array(2))).subarray(2, 4)], [0x00, 0x05], 'the sequence wraps at 16 bits');
  assert.deepEqual([...new Uint8Array(encodeFrame(1, pcm.subarray(1, 3)))].slice(HEADER_BYTES), [...new Uint8Array(pcm.buffer, 2, 4)], 'a view is copied from its own offset');
});

test('a downlink frame decodes to its header and a view of the PCM', () => {
  const bytes = Uint8Array.from([FRAME_VERSION, DOWNLINK, 0xff, 0xfe, 1, 2, 3]);
  const f = decodeFrame(bytes.buffer);
  assert.equal(f.version, FRAME_VERSION);
  assert.equal(f.direction, DOWNLINK);
  assert.equal(f.seq, 0xfffe);
  assert.deepEqual([...f.payload], [1, 2, 3], 'an odd tail is the player\'s to carry');
  assert.equal(decodeFrame(new ArrayBuffer(3)), null, 'too short for a header');
  assert.equal(decodeFrame(new ArrayBuffer(HEADER_BYTES)).payload.byteLength, 0);
});

test('frames are byte for byte backend-v2\'s', { skip: backend ? false : 'this Node cannot load .ts' }, () => {
  const pcm = Buffer.from(Int16Array.from({ length: FRAME_SAMPLES }, (_, i) => 1000 - i * 7).buffer);
  const up = backend.decodeFrame(Buffer.from(encodeFrame(513, new Uint8Array(pcm))));
  assert.deepEqual({ version: up.version, direction: up.direction, seq: up.seq }, { version: backend.FRAME_VERSION, direction: backend.UPLINK, seq: 513 });
  assert.ok(up.payload.equals(pcm));
  assert.equal(FRAME_BYTES, backend.FRAME_BYTES);
  const down = backend.encodeFrame(backend.DOWNLINK, 70_000, pcm);
  const f = decodeFrame(new Uint8Array(down.buffer, down.byteOffset, down.byteLength));
  assert.deepEqual({ version: f.version, direction: f.direction, seq: f.seq }, { version: FRAME_VERSION, direction: DOWNLINK, seq: 70_000 & 0xffff });
  assert.deepEqual([...f.payload], [...pcm]);
});

test('a long turn is ended before the server would cut it', () => {
  const serverCap = TURN_MAX_SEC * OUT_RATE * 2;
  assert.ok(TURN_CAP_FRAMES * FRAME_BYTES <= serverCap, 'every frame the toy sends still fits');
  assert.ok(TURN_CAP_FRAMES * FRAME_MS >= (TURN_MAX_SEC - 1) * 1000, 'and the child gets nearly all of it');
});
