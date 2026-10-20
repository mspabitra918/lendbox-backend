import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

export const sha256Hex = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export const hmacSha256Hex = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

/** 256-bit URL-safe random token. */
export const generateSecureToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Crockford base32 without ambiguous characters (no I, L, O, U).
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Public application reference, e.g. LB-7K3M9QX2 (32^8 ≈ 1.1e12 combinations). */
export function generateApplicationReference(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return `LB-${out}`;
}

export const REFERENCE_PATTERN = /^LB-[0-9A-HJKMNP-TV-Z]{8}$/;

/** Application id, e.g. 56T65T — 6 chars, 32^6 ≈ 1.07e9 combinations. Generated server-side only. */
export function generateApplicationId(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return out;
}

export const APPLICATION_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;
