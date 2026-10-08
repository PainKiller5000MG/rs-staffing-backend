// Field encryption for Aadhaar and bank account numbers (AES-256-GCM), and a
// keyed hash for exact-match lookups without decrypting (HMAC-SHA256).
//
// Ciphertext layout, as the contract documents it: iv (12) | ciphertext | tag (16).
// The key version is stored next to it (aadhaar_records.key_version) so keys
// can rotate. Keys are 32 bytes, base64, from DATA_KEY / HMAC_KEY; dev and test
// fall back to fixed keys, production refuses to start without them.
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from '../core/config.ts';

export const KEY_VERSION = 1;

const IV_BYTES = 12;
const TAG_BYTES = 16;

// Development/test only. Data encrypted with these is not protected.
const DEV_DATA_KEY = Buffer.alloc(32, 'rs-staffing-dev-data-key');
const DEV_HMAC_KEY = Buffer.alloc(32, 'rs-staffing-dev-hmac-key');

function key(name: 'DATA_KEY' | 'HMAC_KEY'): Buffer {
  const cfg = config();
  const value = cfg[name];
  if (value) return Buffer.from(value, 'base64');
  if (cfg.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return name === 'DATA_KEY' ? DEV_DATA_KEY : DEV_HMAC_KEY;
}

export function encrypt(plaintext: string): Uint8Array {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key('DATA_KEY'), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return new Uint8Array(Buffer.concat([iv, body, cipher.getAuthTag()]));
}

export function decrypt(data: Uint8Array, keyVersion = KEY_VERSION): string {
  if (keyVersion !== KEY_VERSION) throw new Error(`Unknown key version ${keyVersion}`);
  const buf = Buffer.from(data);
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key('DATA_KEY'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(IV_BYTES, buf.length - TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** Deterministic keyed hash (64 hex chars) for dedupe and lookup. Normalises digits first. */
export function lookupHmac(value: string): string {
  return createHmac('sha256', key('HMAC_KEY')).update(value.replace(/\D/g, '')).digest('hex');
}

export const last4 = (value: string) => value.replace(/\D/g, '').slice(-4);
