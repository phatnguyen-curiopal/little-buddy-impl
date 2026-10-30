// Speech detection for the web toy, fed one 20 ms frame's loudness at a
// time. Pure, so the timing rules are tested without a microphone.
//
// The Talk screen is hands-free: the mic stays open, a turn starts when the
// child starts talking and ends once they have gone quiet for a while. One
// detector serves the whole session: reset() forgets the last utterance
// but keeps what it learned about the room.
//
// Loud is judged against a noise floor: the quietest frame of the last few
// seconds. Speech always has gaps between syllables, so the floor stays at
// room level while a child talks, while a steady fan or TV becomes the
// floor itself and stops counting as speech.

export const VAD_DEFAULTS = Object.freeze({
  frameMs: 20,
  // Children pause mid-sentence to think; shorter than this cuts them off.
  silenceMs: 1300,
  // A cough or a click is not speech.
  minSpeechMs: 200,
  // Nobody spoke: give up (Infinity keeps listening, as the Talk screen does).
  noSpeechMs: 8000,
  // Loud means this many times the floor, and never below minLevel.
  ratio: 3,
  minLevel: 0.02,
  // The floor is the minimum over this window.
  floorWindowMs: 3000,
  // For the first moments, before the window has seen a gap, assume a quiet
  // room so a child who talks right away is heard. Kept shorter than
  // minSpeechMs so a loud room cannot pass for speech during it.
  priorMs: 160,
  priorFloor: 0.005,
});

// push(rms) returns null, or once each: 'speech' when speech is first
// confirmed, then 'end' after the trailing silence; or 'no_speech' if the
// time runs out before any speech. After that it stays quiet until reset().
export function createVad(options = {}) {
  const o = { ...VAD_DEFAULTS, ...options };
  const size = Math.max(1, Math.round(o.floorWindowMs / o.frameMs));
  const window = [];
  let total = 0;
  let since = 0;
  let speech = 0;
  let silence = 0;
  let heard = false;
  let done = false;

  return {
    get heard() {
      return heard;
    },
    push(rms) {
      if (done) return null;
      total += o.frameMs;
      since += o.frameMs;
      window.push(rms);
      if (window.length > size) window.shift();
      const seen = Math.min(...window);
      const floor = total <= o.priorMs ? Math.min(seen, o.priorFloor) : seen;
      const loud = rms > Math.max(o.minLevel, floor * o.ratio);
      if (loud) {
        speech += o.frameMs;
        silence = 0;
      } else {
        silence += o.frameMs;
        // Gaps between syllables slow the count down; only a lone click
        // fades away before it adds up to speech.
        if (!heard) speech = Math.max(0, speech - o.frameMs / 4);
      }
      if (!heard && speech >= o.minSpeechMs) {
        heard = true;
        return 'speech';
      }
      if (heard && silence >= o.silenceMs) {
        done = true;
        return 'end';
      }
      if (!heard && since >= o.noSpeechMs) {
        done = true;
        return 'no_speech';
      }
      return null;
    },
    // Ready for the next utterance. The noise floor is kept: the room has
    // not changed, and a fresh guess would mishear the first words.
    reset() {
      since = 0;
      speech = 0;
      silence = 0;
      heard = false;
      done = false;
    },
  };
}
