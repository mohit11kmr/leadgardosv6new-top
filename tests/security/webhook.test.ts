import { describe, it, expect } from 'vitest';
import { webhookService } from '../../apps/api/src/services/webhookService.js';

describe('Security: Webhook HMAC Signatures & Replay Prevention (Requirement 22)', () => {
  const secret = 'whsec_test_secret_key_1234567890';
  const payload = JSON.stringify({ event: 'audit.completed', auditId: 'audit-123' });

  it('generates and verifies HMAC-SHA256 webhook signatures', () => {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const signature = webhookService.generateSignature(payload, secret, currentTimestamp);

    const isValid = webhookService.verifySignature(
      payload,
      secret,
      signature,
      currentTimestamp
    );

    expect(isValid).toBe(true);
  });

  it('rejects tampered webhook payloads', () => {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const signature = webhookService.generateSignature(payload, secret, currentTimestamp);
    const tamperedPayload = JSON.stringify({ event: 'audit.completed', auditId: 'hacked-999' });

    const isValid = webhookService.verifySignature(
      tamperedPayload,
      secret,
      signature,
      currentTimestamp
    );

    expect(isValid).toBe(false);
  });

  it('rejects replayed webhook payloads older than tolerance window (300s)', () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const signature = webhookService.generateSignature(payload, secret, expiredTimestamp);

    const isValid = webhookService.verifySignature(
      payload,
      secret,
      signature,
      expiredTimestamp,
      300 // 5-minute window
    );

    expect(isValid).toBe(false); // Replay attack prevented
  });
});
