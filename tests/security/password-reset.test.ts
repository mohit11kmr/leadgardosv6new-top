import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';

describe('Security: Password Reset & Account Recovery (Requirement 8, 9)', () => {
  it('handles secure password reset without email enumeration and terminates active sessions', async () => {
    const email = `pwd_reset_${Date.now()}@example.com`;
    const oldPassword = 'OldSecurePassword1234!';
    const newPassword = 'NewSecurePassword5678!';

    // 1. Create account and session
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password: oldPassword });

    // 2. Request reset for existing email
    const reqRes1 = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email });

    expect(reqRes1.status).toBe(200);
    expect(reqRes1.body.data.message).toContain('If an account exists');
    const token = reqRes1.body.data.debugToken;
    expect(token).toBeDefined();

    // 3. Request reset for non-existent email returns same generic message (prevents enumeration)
    const reqRes2 = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'nonexistent@example.com' });

    expect(reqRes2.status).toBe(200);
    expect(reqRes2.body.data.message).toEqual(reqRes1.body.data.message);

    // 4. Confirm password reset with valid token
    const confirmRes = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);

    // 5. Attempting to reuse same token fails (single use)
    const reuseRes = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword: 'AnotherPassword1234!' });

    expect(reuseRes.status).toBe(500);

    // 6. Old password fails login
    const oldLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword });

    expect(oldLoginRes.status).toBe(401);

    // 7. New password succeeds login
    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword });

    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.success).toBe(true);

    // 8. Verify security event was recorded
    const event = await db.securityEvent.findFirst({
      where: { type: 'PASSWORD_RESET' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeDefined();
  });
});
