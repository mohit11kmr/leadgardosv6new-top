import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';

describe('Security: Session Lifecycle & Multi-Device Revocation (Requirements 6, 12)', () => {
  it('lists active user sessions and allows selective and full revocation', async () => {
    const email = `session_user_${Date.now()}@example.com`;
    const password = 'StrongPassword1234!';

    // 1. Register first session
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .set('User-Agent', 'Desktop-Chrome-120')
      .send({ email, password, organizationName: 'Sessions Org' });

    const token = regRes.body.data.accessToken;

    // 2. Login from second device
    await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'Mobile-Safari-17')
      .send({ email, password });

    // 3. List active sessions
    const listRes = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);

    const targetSession = listRes.body.data[1];

    // 4. Revoke second session
    const revokeRes = await request(app)
      .delete(`/api/v1/auth/sessions/${targetSession.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(revokeRes.status).toBe(204);

    // 5. Logout all sessions
    const logoutAllRes = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutAllRes.status).toBe(204);

    // 6. Verify zero active sessions remaining
    const postLogoutSessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${token}`);

    expect(postLogoutSessions.body.data).toHaveLength(0);
  });
});
