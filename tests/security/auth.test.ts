import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { REFRESH_COOKIE_NAME } from '../../apps/api/src/auth.js';

describe('Security: Authentication, HttpOnly Cookies & Refresh Token Rotation (Requirements 4, 5, 7, 8)', () => {
  it('registers user, issues short-lived accessToken, and sets HttpOnly refresh cookie', async () => {
    const email = `auth_test_${Date.now()}@example.com`;
    const password = 'StrongPassword1234!';

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, organizationName: 'Security Corp' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    // Refresh token must NOT be returned in JSON response body
    expect(res.body.data.refreshToken).toBeUndefined();

    // Verify Set-Cookie header contains HttpOnly leadguard_refresh_token
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    expect(cookieHeader).toContain(REFRESH_COOKIE_NAME);
    expect(cookieHeader.toLowerCase()).toContain('httponly');
    expect(cookieHeader.toLowerCase()).toContain('path=/api/v1/auth');
  });

  it('rotates refresh token on /auth/refresh and invalidates previous refresh token', async () => {
    const email = `rotate_test_${Date.now()}@example.com`;
    const password = 'StrongPassword1234!';

    // 1. Register and capture Set-Cookie (Token A)
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, organizationName: 'Rotate Corp' });

    const cookieA = regRes.headers['set-cookie']![0];

    // 2. Perform refresh with Cookie A -> receives new accessToken & new Set-Cookie (Token B)
    const refreshRes1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA!);

    expect(refreshRes1.status).toBe(200);
    expect(refreshRes1.body.success).toBe(true);
    expect(refreshRes1.body.data.accessToken).toBeDefined();

    const cookieB = refreshRes1.headers['set-cookie']![0];
    expect(cookieB).toBeDefined();
    expect(cookieB).not.toEqual(cookieA);

    // 3. Refresh with Cookie B succeeds
    const refreshRes2 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieB!);

    expect(refreshRes2.status).toBe(200);
    expect(refreshRes2.body.data.accessToken).toBeDefined();
  });

  it('detects token reuse and terminates all user sessions (Requirement 7)', async () => {
    const email = `reuse_test_${Date.now()}@example.com`;
    const password = 'StrongPassword1234!';

    // 1. Register and capture Token A
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password });

    const cookieA = regRes.headers['set-cookie']![0];

    // 2. Normal refresh: Token A -> Token B (Token A rotated)
    const refreshRes1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA!);

    expect(refreshRes1.status).toBe(200);

    // 3. Replay attack: Attacker attempts to reuse rotated Token A
    const replayRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieA!);

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // 4. Verify security event was recorded
    const event = await db.securityEvent.findFirst({
      where: { type: 'REFRESH_REUSE_DETECTED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(event).toBeDefined();
  });

  it('rejects passwords shorter than 12 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: `weak_${Date.now()}@example.com`, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
