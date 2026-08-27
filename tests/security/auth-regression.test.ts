import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { REFRESH_COOKIE_NAME } from '../../apps/api/src/auth.js';

describe('Security Regression Gate: Phase 4 Authentication & HttpOnly Cookie Contract (Requirement 3, 37)', () => {
  it('enforces that refresh token is NEVER exposed in JSON and is managed strictly via HttpOnly cookies', async () => {
    const email = `auth_reg_${Date.now()}@example.com`;
    const password = 'StrongPassword1234!';

    // 1. Registration
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, organizationName: 'Regression Org' });

    expect(regRes.status).toBe(201);
    expect(regRes.body.data.accessToken).toBeDefined();
    // Refresh token MUST NOT be in response JSON
    expect(regRes.body.data.refreshToken).toBeUndefined();

    // HttpOnly cookie verification
    const setCookie = regRes.headers['set-cookie']![0];
    expect(setCookie).toContain(REFRESH_COOKIE_NAME);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('path=/api/v1/auth');

    // 2. Login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();
    expect(loginRes.body.data.refreshToken).toBeUndefined();

    const loginCookie = loginRes.headers['set-cookie']![0];
    expect(loginCookie).toContain(REFRESH_COOKIE_NAME);

    // 3. Token Rotation on /auth/refresh
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', loginCookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).toBeUndefined();

    const rotatedCookie = refreshRes.headers['set-cookie']![0];
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie).not.toEqual(loginCookie);

    // 4. Token Reuse Detection
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', loginCookie); // Using rotated token

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');

    // 5. Logout clears cookie
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', rotatedCookie);

    expect(logoutRes.status).toBe(204);
    const clearCookie = logoutRes.headers['set-cookie']![0];
    expect(clearCookie).toContain('Max-Age=0');
  }, 20000);
});
