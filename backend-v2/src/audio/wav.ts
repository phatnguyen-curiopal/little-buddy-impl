// PCM16 mono WAV helpers. The toy streams raw 16 kHz PCM16 (Opus later);
// Scribe wants a container, and the simulated toy writes replies to disk.

export const SAMPLE_RATE = 16_000;

export function wrapWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function parseWav(buf: Buffer): { pcm: Buffer; sampleRate: number } {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let offset = 12;
  let sampleRate = SAMPLE_RATE;
  let channels = 1;
  let bits = 16;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (channels !== 1 || bits !== 16) throw new Error('only 16-bit mono WAV is supported');
      return { pcm: buf.subarray(body, body + size), sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}

export function pcmSeconds(bytes: number, sampleRate = SAMPLE_RATE): number {
  return bytes / (sampleRate * 2);
}
