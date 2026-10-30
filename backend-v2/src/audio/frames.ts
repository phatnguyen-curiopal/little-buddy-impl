// Binary audio frames of the device protocol: a 4-byte header (version,
// direction, big-endian sequence number) before one 20 ms packet. Codec v1 is
// raw PCM16 at 16 kHz, so a full packet is 640 bytes.

export const FRAME_VERSION = 1;
export const UPLINK = 0;
export const DOWNLINK = 1;
export const FRAME_BYTES = 640;
const HEADER = 4;

export interface Frame {
  version: number;
  direction: number;
  seq: number;
  payload: Buffer;
}

export function encodeFrame(direction: number, seq: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(HEADER);
  header.writeUInt8(FRAME_VERSION, 0);
  header.writeUInt8(direction, 1);
  header.writeUInt16BE(seq & 0xffff, 2);
  return Buffer.concat([header, payload]);
}

export function decodeFrame(buf: Buffer): Frame | null {
  if (buf.length < HEADER) return null;
  return { version: buf.readUInt8(0), direction: buf.readUInt8(1), seq: buf.readUInt16BE(2), payload: buf.subarray(HEADER) };
}

// Re-cuts a stream of arbitrarily sized PCM chunks into 20 ms packets.
export class FrameChunker {
  private pending: Buffer = Buffer.alloc(0);

  push(pcm: Buffer): Buffer[] {
    this.pending = this.pending.length ? Buffer.concat([this.pending, pcm]) : pcm;
    const out: Buffer[] = [];
    while (this.pending.length >= FRAME_BYTES) {
      out.push(this.pending.subarray(0, FRAME_BYTES));
      this.pending = this.pending.subarray(FRAME_BYTES);
    }
    return out;
  }

  flush(): Buffer | null {
    if (!this.pending.length) return null;
    const last = this.pending;
    this.pending = Buffer.alloc(0);
    return last;
  }
}
