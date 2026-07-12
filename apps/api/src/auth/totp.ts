import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30s steps) — exactly what Google
 * Authenticator / Authy / 1Password implement. Self-contained on node
 * crypto; unit tested against the RFC test vectors.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function generateTotpSecret(): string {
  // 20 random bytes → 32 base32 chars, the conventional length.
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let secret = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      secret += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) secret += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return secret;
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(
  secret: string,
  timestampMs: number = Date.now(),
): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret))
    .update(counterBuf)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Accepts the current step ±1 (clock drift on phones is real). */
export function verifyTotp(
  secret: string,
  code: string,
  timestampMs: number = Date.now(),
): boolean {
  const presented = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(presented)) return false;
  for (const drift of [0, -1, 1]) {
    const expected = totpCode(
      secret,
      timestampMs + drift * TOTP_STEP_SECONDS * 1000,
    );
    const a = Buffer.from(expected);
    const b = Buffer.from(presented);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function otpauthUri(
  secret: string,
  accountEmail: string,
  issuer = 'RGS',
): string {
  return (
    `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}` +
    `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
  );
}
