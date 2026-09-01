import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM at-rest encryption for secrets that must be recoverable in
// plaintext later (e.g. webhook HMAC signing secrets, which — unlike
// passwords or API keys — cannot be one-way hashed because the server needs
// the raw value again every time it signs an outgoing webhook).
//
// Ciphertext is tagged with a "v1:" prefix so callers can distinguish
// encrypted values from legacy/plaintext values written before this was
// introduced, and decrypt() transparently passes those through unchanged.
const VERSION_PREFIX = 'v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveKey(rawKey: string): Buffer {
  const key = Buffer.from(rawKey, 'hex');
  if (key.length !== 32) {
    throw new Error('Secret encryption key must be a 64-character hex string (32 bytes)');
  }
  return key;
}

export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = resolveKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a value produced by encryptSecret(). Values that do not carry the
 * "v1:" prefix are assumed to be legacy plaintext (written before at-rest
 * encryption was introduced) and are returned unchanged, so existing rows
 * keep working without a forced data migration.
 */
export function decryptSecret(value: string, rawKey: string): string {
  if (!value.startsWith(VERSION_PREFIX)) {
    return value;
  }
  const key = resolveKey(rawKey);
  const [, ivB64, authTagB64, dataB64] = value.split(':');
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Malformed encrypted secret value');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}
