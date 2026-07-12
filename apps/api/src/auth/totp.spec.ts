import { base32Decode, generateTotpSecret, otpauthUri, totpCode, verifyTotp } from './totp';

// RFC 6238 Appendix B test vectors use the ASCII secret "12345678901234567890",
// which is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('decodes base32', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890');
  });

  it('matches the RFC 6238 SHA-1 test vectors (last 6 digits)', () => {
    // (time, expected 8-digit) → we compare our 6 digits to the tail.
    const vectors: [number, string][] = [
      [59_000, '94287082'],
      [1111111109_000, '07081804'],
      [1234567890_000, '89005924'],
      [2000000000_000, '69279037'],
    ];
    for (const [t, eightDigits] of vectors) {
      expect(totpCode(RFC_SECRET, t)).toBe(eightDigits.slice(-6));
    }
  });

  it('verifies with ±1 step drift and rejects junk', () => {
    const now = 1234567890_000;
    const code = totpCode(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, now + 30_000)).toBe(true); // next step
    expect(verifyTotp(RFC_SECRET, code, now + 90_000)).toBe(false); // too far
    expect(verifyTotp(RFC_SECRET, '000000', now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBe(false);
  });

  it('generates 32-char base32 secrets and valid otpauth URIs', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const uri = otpauthUri(secret, 'user@x.test');
    expect(uri).toContain('otpauth://totp/RGS:user%40x.test');
    expect(uri).toContain(`secret=${secret}`);
  });
});
