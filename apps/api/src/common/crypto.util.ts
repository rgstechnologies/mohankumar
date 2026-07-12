import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets stored at rest —
 * e.g. a company's NIC e-way bill API password. Values are tagged with a version
 * prefix so we can decrypt transparently and migrate formats later. Anything
 * without the prefix is treated as legacy plaintext and returned as-is, so the
 * change is backward-compatible with rows written before encryption existed.
 */
const PREFIX = 'enc:v1:';

/** Derives a stable 32-byte key from the configured secret. */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'bookly-field-encryption-v1', 32);
}

export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // layout: [iv(12) | authTag(16) | ciphertext]
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(value: string, secret: string): string {
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}
