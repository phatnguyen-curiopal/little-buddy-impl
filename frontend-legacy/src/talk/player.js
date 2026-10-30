import { pcm16ToFloat32 } from './dsp.js';

// Plays Buddy's voice: PCM16 chunks at the rate the `audio` message names,
// scheduled back to back as they arrive so playback starts before the last
// chunk lands. Browsers only let a page start audio after a gesture, so
// unlock() is called from the tap and from Send.
export function createPlayer({ onEnded }) {
  let ctx = null;
  let rate = 16000;
  let active = false;
  let finishing = false;
  let nextAt = 0;
  let carry = null;
  let guard = null;
  const sources = new Set();

  const done = () => {
    if (!active) return;
    active = false;
    finishing = false;
    clearTimeout(guard);
    onEnded?.();
  };

  const maybeDone = () => {
    if (active && finishing && sources.size === 0) done();
  };

  function unlock() {
    if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return;
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function stop() {
    clearTimeout(guard);
    for (const src of sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    sources.clear();
    active = false;
    finishing = false;
    carry = null;
  }

  function begin(sampleRate) {
    stop();
    unlock();
    rate = Number(sampleRate) || 16000;
    active = true;
    nextAt = 0;
  }

  function push(data) {
    if (!active || !ctx) return;
    let bytes = new Uint8Array(data);
    if (carry) {
      const joined = new Uint8Array(carry.length + bytes.length);
      joined.set(carry);
      joined.set(bytes, carry.length);
      bytes = joined;
      carry = null;
    }
    if (bytes.length % 2) {
      carry = bytes.slice(-1);
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    if (!bytes.length) return;
    const samples = pcm16ToFloat32(bytes);
    const buffer = ctx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.05, nextAt);
    src.start(at);
    nextAt = at + buffer.duration;
    sources.add(src);
    src.onended = () => {
      sources.delete(src);
      maybeDone();
    };
  }

  function finish() {
    if (!active) return;
    finishing = true;
    // A context the browser keeps suspended never fires onended; the
    // screen must not stay on "speaking" forever because of that.
    const left = ctx && ctx.state === 'running' ? Math.max(0, nextAt - ctx.currentTime) : 0;
    guard = setTimeout(done, left * 1000 + 1500);
    maybeDone();
  }

  function close() {
    stop();
    ctx?.close().catch(() => {});
    ctx = null;
  }

  return { unlock, begin, push, finish, stop, close, get playing() { return active; } };
}
