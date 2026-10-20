import { createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Uniform over 62 symbols: bytes above the last full multiple of 62 are discarded. */
export function randomToken(length: number): string {
  let token = '';
  while (token.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248 && token.length < length) token += ALPHABET.charAt(byte % 62);
    }
  }
  return token;
}

/** HMAC-SHA256 with a server-side pepper: a leaked table of digests cannot be brute-forced offline. */
export function hashToken(token: string, pepper: Buffer): Buffer {
  return createHmac('sha256', pepper).update(token).digest();
}

export function parseOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error(`${value}: origins must use HTTPS (localhost excepted)`);
  }
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(`${value}: an origin has no path`);
  return url.origin;
}
