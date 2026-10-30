import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

export function fromB64url(text: string): Buffer {
  return Buffer.from(text, 'base64url');
}

export function sha256hex(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

export function hmacB64url(key: Buffer | string, message: string): string {
  return createHmac('sha256', key).update(message).digest('base64url');
}

// Constant-time comparison; unequal lengths are rejected without comparing.
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

// Separate subkeys per purpose, so one leaked derived key exposes nothing else.
export function deriveKey(secret: string, label: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.alloc(0), Buffer.from(label), 32));
}

// AES-256-GCM: iv (12) | tag (16) | ciphertext. The AAD binds a sealed value
// to its row, so a secret copied onto another device row fails to open.
export function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

export function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}
