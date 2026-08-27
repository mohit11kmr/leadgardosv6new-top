import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateExternalUrl } from './security.js';

describe('SSRF protection', () => {
  const orig = process.env.ALLOW_LOCAL_FIXTURES;

  beforeEach(() => {
    delete process.env.ALLOW_LOCAL_FIXTURES;
  });

  afterEach(() => {
    if (orig !== undefined) {
      process.env.ALLOW_LOCAL_FIXTURES = orig;
    }
  });

  it('rejects local targets', async () => {
    await expect(validateExternalUrl('http://127.0.0.1')).rejects.toThrow();
    await expect(validateExternalUrl('http://[::1]')).rejects.toThrow();
    await expect(validateExternalUrl('file:///etc/passwd')).rejects.toThrow();
  });
});
