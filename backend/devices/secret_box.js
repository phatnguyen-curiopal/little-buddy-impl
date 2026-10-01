import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import config from '../config.js';

// HMAC verification needs the raw device secret, so it cannot be hashed like
// a password. Instead it is sealed with AES-256-GCM under a key derived from
// DEVICE_KEK, with the device id as associated data so a ciphertext cannot be
// moved between rows. A database dump alone therefore yields nothing; a
// compromised app server (which holds the KEK) is out of scope for now.
const VERSION = 'v1';
const IV_LEN = 12;
const SECRET_LEN = 32;

export function newDeviceSecret() {
  return randomBytes(SECRET_LEN);
}

// The credential the web toy signs with. It is derived from the device
// secret and the current ownership (family and claim time), never the
// factory secret itself, so an unpair and any new claim (even by the same
// family) turn every copy a browser kept into a dead key, while the physical
// toy keeps working. HKDF is one-way: holding it reveals nothing about the
// device secret. A rotation of the device secret kills it too.
export function webToySecret(deviceSecret, { familyId, claimedAt }) {
  const info = `lb-web-toy:${familyId}:${new Date(claimedAt).getTime()}`;
  return Buffer.from(hkdfSync('sha256', deviceSecret, '', info, SECRET_LEN));
}

// One env var, two purposes, two unrelated subkeys via HKDF: the wrap key
// never touches claim codes and vice versa.
export function makeSecretBox(kek) {
  const ikm = Buffer.from(kek, 'utf8');
  const wrapKey = Buffer.from(hkdfSync('sha256', ikm, '', 'lb-secret-wrap', 32));
  const claimKey = Buffer.from(hkdfSync('sha256', ikm, '', 'lb-claim-mac', 32));

  function wrapSecret(deviceId, secret) {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', wrapKey, iv);
    cipher.setAAD(Buffer.from(deviceId, 'utf8'));
    const ct = Buffer.concat([cipher.update(secret), cipher.final()]);
    return [VERSION, iv.toString('hex'), cipher.getAuthTag().toString('hex'), ct.toString('hex')].join(':');
  }

  // Throws on a tampered ciphertext, a wrong device id, or a wrong KEK.
  function unwrapSecret(deviceId, wrapped) {
    const [version, ivHex, tagHex, ctHex] = String(wrapped).split(':');
    if (version !== VERSION) throw new Error(`secret_box: unsupported version ${version}`);
    const decipher = createDecipheriv('aes-256-gcm', wrapKey, Buffer.from(ivHex, 'hex'));
    decipher.setAAD(Buffer.from(deviceId, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
  }

  // Peppered rather than plain sha256: an 8-char code is brute-forced from a
  // plain hash in seconds, but not without the pepper.
  function claimCodeHash(normalizedCode) {
    return createHmac('sha256', claimKey).update(normalizedCode).digest('hex');
  }

  return { wrapSecret, unwrapSecret, claimCodeHash };
}

const box = makeSecretBox(config.deviceKek);
export const { wrapSecret, unwrapSecret, claimCodeHash } = box;
