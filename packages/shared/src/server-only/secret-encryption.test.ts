import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from './secret-encryption.js';

const KEY = 'c'.repeat(64);
const OTHER_KEY = 'd'.repeat(64);

describe('secret-encryption', () => {
  it('round-trips a plaintext secret through encrypt/decrypt', () => {
    const plaintext = 'whsec_super_secret_value_123';
    const encrypted = encryptSecret(plaintext, KEY);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptSecret(encrypted, KEY)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const a = encryptSecret('whsec_same_value', KEY);
    const b = encryptSecret('whsec_same_value', KEY);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const encrypted = encryptSecret('whsec_value', KEY);
    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow();
  });

  it('passes legacy plaintext values through unchanged (no "v1:" prefix)', () => {
    const legacyValue = 'whsec_written_before_encryption_existed';
    expect(decryptSecret(legacyValue, KEY)).toBe(legacyValue);
  });
});
