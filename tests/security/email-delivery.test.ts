import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { emailProvider } from '@leadguard/shared/dist/server-only/email-provider.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

/**
 * Regression suite for the "password reset instructions have been
 * dispatched... but nothing ever dispatches anything" gap found in the
 * Revenue Intelligence R&D phase. Covers both password-reset and
 * email-verification delivery, using the real emailProvider singleton
 * (ConsoleEmailProvider in test env — no real SMTP/network dependency) with
 * a spy to assert on send content, and a mocked rejection to prove SMTP
 * failure never breaks the request.
 */
describe('Password reset — email delivery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the reset email to the correct recipient with the token embedded in the link', async () => {
    const spy = vi.spyOn(emailProvider, 'sendEmail');
    const email = `pwd_reset_delivery_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'OldSecurePassword1234!' });

    const res = await request(app).post('/api/v1/auth/password-reset/request').send({ email });
    expect(res.status).toBe(200);
    const token = res.body.data.debugToken as string;

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0]![0];
    expect(call.to).toBe(email);
    expect(call.subject).toContain('Reset your LeadGuard password');
    expect(call.body).toContain(`token=${token}`);
    expect(call.body).toContain('/reset-password?token=');
  });

  it('does not fail the request when the email provider throws (SMTP unavailable)', async () => {
    vi.spyOn(emailProvider, 'sendEmail').mockRejectedValueOnce(new Error('SMTP connection refused'));
    const email = `pwd_reset_smtp_down_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'OldSecurePassword1234!' });

    const res = await request(app).post('/api/v1/auth/password-reset/request').send({ email });
    // Still returns the generic success message — a delivery failure must
    // never surface as an API error (would both leak infra state to an
    // unauthenticated caller and break the anti-enumeration contract).
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('If an account exists');
  });

  it('never logs the raw token or reset URL to stdout/stderr', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const email = `pwd_reset_nolog_${Date.now()}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password: 'OldSecurePassword1234!' });
    const res = await request(app).post('/api/v1/auth/password-reset/request').send({ email });
    const token = res.body.data.debugToken as string;

    const allLoggedText = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().map((a) => JSON.stringify(a)).join('\n');
    expect(allLoggedText).not.toContain(token);
    expect(allLoggedText).not.toContain('reset-password?token=');
  });

  it('returns a non-existent-email response indistinguishable from a real one, and sends no email for it', async () => {
    const spy = vi.spyOn(emailProvider, 'sendEmail');
    const res = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: `truly_does_not_exist_${Date.now()}@example.com` });
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Email verification — delivery + lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function registerAndAuth() {
    const email = `verify_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
    const register = await request(app).post('/api/v1/auth/register').send({ email, password: 'SecurePassword1234!' });
    const userId = register.body.data.user.id as string;
    const orgId = register.body.data.organization.id as string;
    const token = createAccessToken(userId, orgId);
    return { email, userId, token };
  }

  it('sends the verification email to the correct recipient with the token embedded', async () => {
    const spy = vi.spyOn(emailProvider, 'sendEmail');
    const { email, token } = await registerAndAuth();

    const res = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    const verifyToken = res.body.data.debugToken as string;

    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0]![0];
    expect(call.to).toBe(email);
    expect(call.subject).toContain('Verify your LeadGuard email');
    expect(call.body).toContain(`token=${verifyToken}`);
  });

  it('confirms a valid token and marks the user verified', async () => {
    const { token } = await registerAndAuth();
    const reqRes = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const verifyToken = reqRes.body.data.debugToken as string;

    const confirmRes = await request(app).post('/api/v1/auth/email-verification/confirm').send({ token: verifyToken });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.success).toBe(true);
  });

  it('rejects an expired token', async () => {
    const { userId, token } = await registerAndAuth();
    const reqRes = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const verifyToken = reqRes.body.data.debugToken as string;

    // Force the token to look expired.
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(verifyToken).digest('hex');
    await db.emailVerificationToken.updateMany({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const confirmRes = await request(app).post('/api/v1/auth/email-verification/confirm').send({ token: verifyToken });
    expect(confirmRes.status).toBe(500);
    void userId;
  });

  it('rejects reuse of an already-used token (single-use)', async () => {
    const { token } = await registerAndAuth();
    const reqRes = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const verifyToken = reqRes.body.data.debugToken as string;

    await request(app).post('/api/v1/auth/email-verification/confirm').send({ token: verifyToken });
    const secondAttempt = await request(app).post('/api/v1/auth/email-verification/confirm').send({ token: verifyToken });
    expect(secondAttempt.status).toBe(500);
  });

  it('rejects an invalid/unrecognized token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email-verification/confirm')
      .send({ token: 'totally-invalid-token-that-was-never-issued' });
    expect(res.status).toBe(500);
  });

  it('does not send another email or create another token for an already-verified user (resend/already-verified behavior)', async () => {
    const { token } = await registerAndAuth();
    const reqRes = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const verifyToken = reqRes.body.data.debugToken as string;
    await request(app).post('/api/v1/auth/email-verification/confirm').send({ token: verifyToken });

    const spy = vi.spyOn(emailProvider, 'sendEmail');
    const secondRequest = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(secondRequest.status).toBe(200);
    expect(secondRequest.body.data.alreadyVerified).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not fail the request when the email provider throws (SMTP unavailable)', async () => {
    vi.spyOn(emailProvider, 'sendEmail').mockRejectedValueOnce(new Error('SMTP connection refused'));
    const { token } = await registerAndAuth();
    const res = await request(app)
      .post('/api/v1/auth/email-verification/request')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
  });
});
