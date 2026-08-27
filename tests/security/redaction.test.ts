import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../../apps/api/src/services/redactService.js';

describe('Security: Log Redaction Utility (Requirement 28)', () => {
  it('recursively redacts sensitive keys such as passwords, tokens, API keys, and cookie headers', () => {
    const rawLog = {
      user: {
        id: 'usr-123',
        email: 'test@example.com',
        password: 'PlainTextPassword123!',
        passwordHash: '$argon2id$v=19$...',
      },
      auth: {
        token: 'eyJhbGciOiJIUzI1Ni...',
        refreshToken: 'rft_secret_token_123',
        apiKey: 'lg_live_secret_456',
        cookie: 'leadguard_refresh_token=secret123; session=xyz',
      },
      request: {
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1Ni...',
        },
      },
      auditResult: {
        score: 85,
        status: 'COMPLETED',
      },
    };

    const redacted = redactSensitive(rawLog) as typeof rawLog;

    expect(redacted.user.password).toBe('[REDACTED]');
    expect(redacted.user.passwordHash).toBe('[REDACTED]');
    expect(redacted.auth.token).toBe('[REDACTED]');
    expect(redacted.auth.refreshToken).toBe('[REDACTED]');
    expect(redacted.auth.apiKey).toBe('[REDACTED]');
    expect(redacted.auth.cookie).toBe('[REDACTED]');
    expect(redacted.request.headers.authorization).toBe('[REDACTED]');

    // Non-sensitive data remains preserved
    expect(redacted.user.id).toBe('usr-123');
    expect(redacted.user.email).toBe('test@example.com');
    expect(redacted.auditResult.score).toBe(85);
  });
});
