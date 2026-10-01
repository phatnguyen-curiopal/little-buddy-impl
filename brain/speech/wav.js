import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SAMPLE_RATE = 16000;
export const BYTES_PER_SEC = SAMPLE_RATE * 2;

// PCM16 mono -> a WAV file, which is what the batch STT endpoint wants.
export function wrapWav(pcm, sampleRate = SAMPLE_RATE) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// STT_DUMP_WAV names files by turn id, never by transcript: the clip already
// holds the child's voice, the filename does not need their words too.
export function dumpWav(dir, pcm, label) {
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    writeFileSync(join(dir, `${stamp}_${String(label).replace(/[^A-Za-z0-9_-]/g, '')}.wav`), wrapWav(pcm));
  } catch {
    // A debug aid must never cost a turn.
  }
}
