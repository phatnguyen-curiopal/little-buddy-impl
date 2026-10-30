// The child's tone of voice from the audio itself: loudness, pitch and pace,
// measured as the frames arrive and compared with this child's own usual
// voice, because children's voices differ far more from one another than one
// child's voice does from day to day. It only adds a hint to the brief; the
// child's words still decide safety and what the turn is for.

const SAMPLE_RATE = 16_000;
const FRAME_BYTES = 640;
// Quieter frames are silence or room noise.
const VOICED_DBFS = -42;
// Children speak between about 200 and 450 Hz; 120 to 500 Hz leaves room.
const MIN_LAG = Math.floor(SAMPLE_RATE / 500);
const MAX_LAG = Math.ceil(SAMPLE_RATE / 120);
// Half a second of voice before anything is judged.
const MIN_VOICED_FRAMES = 25;
// A baseline needs a few turns before a turn can stand out from it.
const MIN_BASELINE_TURNS = 5;

export interface ToneReading {
  loudness: number;
  pitch: number | null;
  pace: number | null;
  voicedSeconds: number;
}

export class ToneMeter {
  private voiced = 0;
  private loudness = 0;
  private pitches: number[] = [];
  private carry = Buffer.alloc(0);

  push(pcm: Buffer): void {
    const buf = this.carry.length ? Buffer.concat([this.carry, pcm]) : pcm;
    let at = 0;
    for (; at + FRAME_BYTES <= buf.length; at += FRAME_BYTES) this.frame(buf.subarray(at, at + FRAME_BYTES));
    this.carry = Buffer.from(buf.subarray(at));
  }

  private frame(f: Buffer): void {
    const n = f.length / 2;
    const x = new Float32Array(n);
    let energy = 0;
    for (let i = 0; i < n; i += 1) {
      x[i] = f.readInt16LE(i * 2) / 32768;
      energy += x[i] * x[i];
    }
    const db = 20 * Math.log10(Math.sqrt(energy / n) + 1e-9);
    if (db < VOICED_DBFS) return;
    this.voiced += 1;
    this.loudness += db;
    // Pitch on every other voiced frame is plenty and halves the cost.
    if (this.voiced % 2) return;
    const r = new Float32Array(MAX_LAG + 1);
    let best = 0;
    for (let lag = MIN_LAG; lag <= MAX_LAG; lag += 1) {
      let num = 0;
      let e1 = 0;
      let e2 = 0;
      for (let i = 0; i + lag < n; i += 1) {
        num += x[i] * x[i + lag];
        e1 += x[i] * x[i];
        e2 += x[i + lag] * x[i + lag];
      }
      r[lag] = num / Math.sqrt(e1 * e2 + 1e-12);
      best = Math.max(best, r[lag]);
    }
    if (best <= 0.6) return;
    // Twice the period correlates almost as well as the period itself, so
    // the first strong peak is the pitch, not the highest one.
    for (let lag = MIN_LAG + 1; lag < MAX_LAG; lag += 1) {
      if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        this.pitches.push(SAMPLE_RATE / lag);
        return;
      }
    }
  }

  // words: how many words the child said, for the pace.
  read(words: number): ToneReading | null {
    if (this.voiced < MIN_VOICED_FRAMES) return null;
    const voicedSeconds = this.voiced * 0.02;
    const sorted = [...this.pitches].sort((a, b) => a - b);
    return {
      loudness: this.loudness / this.voiced,
      pitch: sorted.length >= 5 ? sorted[Math.floor(sorted.length / 2)] : null,
      pace: words > 0 ? words / voicedSeconds : null,
      voicedSeconds,
    };
  }
}

export interface VoiceBaseline {
  turns: number;
  loudness_mean: number;
  loudness_m2: number;
  pitch_mean: number;
  pitch_m2: number;
  pace_mean: number;
  pace_m2: number;
}

// Welford's running mean and spread. Only full readings count, so every
// measure shares one count.
export function foldBaseline(b: VoiceBaseline | null, r: ToneReading): VoiceBaseline | null {
  if (r.pitch === null || r.pace === null) return b;
  const n = (b?.turns ?? 0) + 1;
  const step = (mean: number, m2: number, x: number): [number, number] => {
    const d = x - mean;
    const next = mean + d / n;
    return [next, m2 + d * (x - next)];
  };
  const [lm, l2] = step(b?.loudness_mean ?? 0, b?.loudness_m2 ?? 0, r.loudness);
  const [pm, p2] = step(b?.pitch_mean ?? 0, b?.pitch_m2 ?? 0, r.pitch);
  const [am, a2] = step(b?.pace_mean ?? 0, b?.pace_m2 ?? 0, r.pace);
  return { turns: n, loudness_mean: lm, loudness_m2: l2, pitch_mean: pm, pitch_m2: p2, pace_mean: am, pace_m2: a2 };
}

export interface ToneJudgement {
  note: string;
  // Quieter and slower than usual: no startle games, and a gentle check-in.
  low: boolean;
}

// The spread never counts as smaller than these, so a very steady child does
// not trip on noise: 2 dB, 15 Hz, 0.3 words a second.
const FLOOR = { loudness: 2, pitch: 15, pace: 0.3 };

export function judgeTone(r: ToneReading | null, b: VoiceBaseline | null): ToneJudgement | null {
  if (!r || !b || b.turns < MIN_BASELINE_TURNS) return null;
  const z = (x: number | null, mean: number, m2: number, floor: number) =>
    x === null ? 0 : (x - mean) / Math.max(floor, Math.sqrt(m2 / (b.turns - 1)));
  const loud = z(r.loudness, b.loudness_mean, b.loudness_m2, FLOOR.loudness);
  const pitch = z(r.pitch, b.pitch_mean, b.pitch_m2, FLOOR.pitch);
  const pace = z(r.pace, b.pace_mean, b.pace_m2, FLOOR.pace);
  if (loud <= -1.5 && r.loudness < -32) return { note: 'Very quiet, almost a whisper: speak softly too, and ask gently how they are.', low: true };
  if (loud <= -1 && pace <= -0.5) return { note: 'Quieter and slower than usual: they may be tired or a little low. Check in gently.', low: true };
  if (loud >= 1 && (pitch >= 1 || pace >= 1)) return { note: 'Louder and higher or faster than usual: they sound excited, or maybe upset. Match their excitement, or ask if unsure.', low: false };
  return null;
}
