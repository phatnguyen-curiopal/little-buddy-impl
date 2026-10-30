import { pcm16ToFloat32 } from './dsp.js';

// Plays Buddy's voice: the PCM16 of the downlink frames, at the rate the
// server's ready message names (16 kHz). backend-v2 sends 20 ms frames as
// fast as the voice is made, sentence by sentence, and any of them can be
// late. So frames are joined into longer buffers before they are scheduled
// (each buffer is resampled to the device's rate on its own, and a seam
// every 20 ms buzzes), and a burst, the first buffer after the queue ran
// dry, starts a little ahead, so the frames behind it may come late without
// a gap. A gap between two sentences never ends playback; only finish()
// (audio_end, or turn_done) does, once everything queued has played.
// Browsers only let a page start audio after a gesture, so unlock() is
// called from every tap.

export const PLAYBACK = Object.freeze({
  // How far ahead of now a burst starts.
  leadSec: 0.2,
  // How much sound one buffer holds.
  chunkSec: 0.12,
  // A shorter buffer goes out anyway once only this much sound is queued
  // ahead of it: the end of a sentence, or a stream slower than speech.
  // leadSec covers chunkSec plus this, so a stream that only keeps pace
  // still fills whole buffers in time.
  lowWaterSec: 0.06,
});

// When sound wanted at `at` can start: then, or, if that moment has passed
// (the queue ran dry), a lead from now.
export function startAt(at, now, o = PLAYBACK) {
  return at > now ? at : now + o.leadSec;
}

// The player's arithmetic, pure so it is tested without an AudioContext:
// samples go in as they arrive, and whole buffers come out, each with the
// moment it starts on the audio clock (seconds).
export function createSchedule(rate = 16000, o = PLAYBACK) {
  const chunk = Math.round(o.chunkSec * rate);
  let parts = [];
  let count = 0;
  // When the gathered samples are to start, and where the scheduled sound ends.
  let at = 0;
  let end = 0;

  // A flush that comes late (a timer held up) finds the queue dry, and so
  // starts a burst of its own.
  const flush = (now) => {
    if (!count) return null;
    const samples = new Float32Array(count);
    let offset = 0;
    for (const part of parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    const start = startAt(at, now, o);
    parts = [];
    count = 0;
    end = start + samples.length / rate;
    return { samples, start };
  };

  return {
    // One frame's samples. A buffer to schedule now comes back in buffer;
    // otherwise wait says how long (seconds) the gathered samples may wait
    // for more before flush must send them anyway.
    push(samples, now) {
      if (!count) at = startAt(end, now, o);
      parts.push(samples);
      count += samples.length;
      if (count >= chunk) return { buffer: flush(now), wait: 0 };
      const wait = Math.max(0, at - o.lowWaterSec - now);
      return wait > 0 ? { buffer: null, wait } : { buffer: flush(now), wait: 0 };
    },
    flush,
    reset() {
      parts = [];
      count = 0;
      at = 0;
      end = 0;
    },
    // Seconds of sound still to play after now, the gathered samples
    // included (they go out right behind what is scheduled).
    ahead(now) {
      return Math.max(0, (count ? at + count / rate : end) - now);
    },
    get end() {
      return end;
    },
  };
}

export function createPlayer({ onEnded }) {
  let ctx = null;
  let rate = 16000;
  let schedule = createSchedule(rate);
  let active = false;
  let finishing = false;
  let carry = null;
  let guard = null;
  let hold = null;
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

  function play(out) {
    if (!out || !ctx) return;
    const buffer = ctx.createBuffer(1, out.samples.length, rate);
    buffer.copyToChannel(out.samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(out.start);
    sources.add(src);
    src.onended = () => {
      sources.delete(src);
      maybeDone();
    };
  }

  // The gathered tail goes out now: its time is up, or no more is coming.
  function flush() {
    clearTimeout(hold);
    hold = null;
    if (ctx) play(schedule.flush(ctx.currentTime));
  }

  function stop() {
    clearTimeout(guard);
    clearTimeout(hold);
    hold = null;
    for (const src of sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    sources.clear();
    schedule.reset();
    active = false;
    finishing = false;
    carry = null;
  }

  function begin(sampleRate) {
    stop();
    unlock();
    const next = Number(sampleRate) || 16000;
    if (next !== rate) schedule = createSchedule(next);
    rate = next;
    active = true;
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
    const out = schedule.push(pcm16ToFloat32(bytes), ctx.currentTime);
    if (out.buffer) {
      clearTimeout(hold);
      hold = null;
      play(out.buffer);
    } else if (!hold) {
      // The deadline belongs to the gathered samples, so later frames do
      // not move it.
      hold = setTimeout(flush, out.wait * 1000);
    }
  }

  function finish() {
    // audio_end and turn_done can both say so; a second guard timer would
    // outlive this answer and cut the next one short.
    if (!active || finishing) return;
    finishing = true;
    flush();
    // A context the browser keeps suspended never fires onended; the
    // screen must not stay on "speaking" forever because of that.
    const left = ctx && ctx.state === 'running' ? Math.max(0, schedule.end - ctx.currentTime) : 0;
    guard = setTimeout(done, left * 1000 + 1500);
    maybeDone();
  }

  function close() {
    stop();
    ctx?.close().catch(() => {});
    ctx = null;
  }

  return {
    unlock, begin, push, finish, stop, close,
    get playing() { return active; },
    // How long (seconds) the voice already received will still be heard: 0
    // while the browser keeps the context suspended, when none of it plays.
    get ahead() { return active && ctx?.state === 'running' ? schedule.ahead(ctx.currentTime) : 0; },
  };
}
