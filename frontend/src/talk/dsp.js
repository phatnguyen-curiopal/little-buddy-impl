// Audio math for the web toy, pure so node --test can check it. The mic's
// AudioWorklet runs Downsampler, FrameChunker and frameRms too: mic.js
// builds the worklet module from their source text, so the code the tests
// exercise is the code that runs in the audio thread. That is why these
// three must stay self-contained (no imports, no module constants, no class
// fields): their toString() has to work on its own.

export const OUT_RATE = 16000;
export const FRAME_SAMPLES = 320; // 20 ms at 16 kHz
export const FRAME_BYTES = FRAME_SAMPLES * 2; // what the device protocol calls one frame

// Low-pass then resample to outRate, Float32 in, Int16 out. The low-pass
// (6th-order Butterworth as three biquads, cutoff just under the new
// Nyquist) keeps 8 to 24 kHz content from folding back into the speech band
// as hiss; linear interpolation is then enough for a speech-to-text model.
// State carries across calls, so any block size gives a seamless stream.
export class Downsampler {
  constructor(inRate, outRate) {
    this.ratio = inRate / outRate;
    this.filter = inRate > outRate;
    const w0 = (2 * Math.PI * outRate * 0.45) / inRate;
    const cos = Math.cos(w0);
    // One biquad per Q of the Butterworth pole pairs: [b0, b1, b2, a1, a2].
    this.coef = [0.5176, 0.7071, 1.9319].map((q) => {
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      const b0 = (1 - cos) / 2 / a0;
      return [b0, (1 - cos) / a0, b0, (-2 * cos) / a0, (1 - alpha) / a0];
    });
    // x1, x2, y1, y2 for each stage
    this.z = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.pos = 0;
    this.prev = 0;
  }

  lowpass(input) {
    const out = new Float32Array(input.length);
    const z = this.z;
    const c = this.coef;
    for (let i = 0; i < input.length; i += 1) {
      let x = input[i];
      for (let k = 0; k < 3; k += 1) {
        const s = k * 4;
        const q = c[k];
        const y = q[0] * x + q[1] * z[s] + q[2] * z[s + 1] - q[3] * z[s + 2] - q[4] * z[s + 3];
        z[s + 1] = z[s];
        z[s] = x;
        z[s + 3] = z[s + 2];
        z[s + 2] = y;
        x = y;
      }
      out[i] = x;
    }
    return out;
  }

  process(input) {
    const n = input.length;
    if (n === 0) return new Int16Array(0);
    const f = this.filter ? this.lowpass(input) : input;
    const out = [];
    let p = this.pos;
    // p is the read position in input samples relative to this block;
    // index -1 is the last sample of the previous block.
    while (p <= n - 1) {
      const i = Math.floor(p);
      const frac = p - i;
      const a = i < 0 ? this.prev : f[i];
      const b = i + 1 <= n - 1 ? f[i + 1] : a;
      let v = a + (b - a) * frac;
      if (v > 1) v = 1;
      else if (v < -1) v = -1;
      out.push(Math.round(v * 32767));
      p += this.ratio;
    }
    this.pos = p - n;
    this.prev = f[n - 1];
    return Int16Array.from(out);
  }
}

// Cuts a stream of Int16 samples into fixed frames; the tail waits for the
// next call.
export class FrameChunker {
  constructor(size) {
    this.size = size;
    this.buf = new Int16Array(size);
    this.n = 0;
  }

  push(samples) {
    const frames = [];
    let i = 0;
    while (i < samples.length) {
      const take = Math.min(this.size - this.n, samples.length - i);
      this.buf.set(samples.subarray(i, i + take), this.n);
      this.n += take;
      i += take;
      if (this.n === this.size) {
        frames.push(this.buf);
        this.buf = new Int16Array(this.size);
        this.n = 0;
      }
    }
    return frames;
  }
}

// Root mean square of an Int16 frame, as 0..1 of full scale.
export function frameRms(frame) {
  if (!frame.length) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const v = frame[i] / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / frame.length);
}

// How full the listening ring is drawn: -50 dBFS (a quiet room) is empty,
// -12 dBFS (a child talking close to the mic) is full.
export function levelFromRms(rms) {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 50) / 38));
}

// PCM16 little-endian bytes to Float32 samples for an AudioBuffer. An odd
// trailing byte cannot be a sample and is ignored; the caller carries it.
export function pcm16ToFloat32(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const count = Math.floor(u8.length / 2);
  const view = new DataView(u8.buffer, u8.byteOffset, count * 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

// The worklet module mic.js loads from a Blob. registerProcessor and
// sampleRate are globals of the AudioWorkletGlobalScope.
export function workletSource() {
  return [
    `const Downsampler = (${Downsampler.toString()});`,
    `const FrameChunker = (${FrameChunker.toString()});`,
    `const frameRms = (${frameRms.toString()});`,
    `class LbMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ds = new Downsampler(sampleRate, ${OUT_RATE});
    this.chunker = new FrameChunker(${FRAME_SAMPLES});
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (const frame of this.chunker.push(this.ds.process(channel))) {
        this.port.postMessage({ frame: frame.buffer, rms: frameRms(frame) }, [frame.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('lb-mic', LbMic);`,
  ].join('\n');
}
