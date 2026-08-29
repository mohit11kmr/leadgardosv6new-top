import { describe, it, expect } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL ??= 'redis://localhost:16380';
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.APP_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';
// Razorpay TEST-mode placeholders so the config schema loads in tests.
process.env.PAYMENT_PROVIDER_MODE ??= 'TEST';
process.env.RAZORPAY_KEY_ID ??= 'rzp_test_placeholder_key_id';
process.env.RAZORPAY_KEY_SECRET ??= 'placeholder_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET ??= 'placeholder_webhook_secret';

describe('API Foundation and Tenant Isolation Tests', () => {
  it('returns health status', async () => {
    const { app } = await import('./server.js');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  }, 15_000);

  it('enforces strict multi-tenant boundaries (Tenant Test)', async () => {
    const { app } = await import('./server.js');

    // Register User A / Org A
    const resA = await request(app).post('/api/v1/auth/register').send({
      email: `tenantA-${Date.now()}@example.com`,
      password: 'password123456',
      organizationName: 'Org A',
    });
    expect(resA.status).toBe(201);
    const tokenA = resA.body.data.accessToken;

    // Register User B / Org B
    const resB = await request(app).post('/api/v1/auth/register').send({
      email: `tenantB-${Date.now()}@example.com`,
      password: 'password123456',
      organizationName: 'Org B',
    });
    expect(resB.status).toBe(201);
    const tokenB = resB.body.data.accessToken;

    // Org A creates a website
    const siteA = await request(app)
      .post('/api/v1/websites')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Site A', url: 'https://example.com' });
    expect(siteA.status).toBe(201);
    const websiteIdA = siteA.body.data.id;

    // Org A creates an audit
    const auditA = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ websiteId: websiteIdA });
    expect(auditA.status).toBe(202);
    const auditIdA = auditA.body.data.id;

    // 1. Tenant B cannot access Tenant A website
    const getSiteB = await request(app)
      .get(`/api/v1/websites/${websiteIdA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getSiteB.status).toBe(404);

    // 2. Tenant B cannot access Tenant A audit
    const getAuditB = await request(app)
      .get(`/api/v1/audits/${auditIdA}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getAuditB.status).toBe(404);

    // 3. Tenant B cannot access Tenant A findings
    const getFindingsB = await request(app)
      .get(`/api/v1/audits/${auditIdA}/findings`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getFindingsB.status).toBe(404);

    // 4. Tenant B cannot access Tenant A business impact
    const getImpactB = await request(app)
      .get(`/api/v1/audits/${auditIdA}/business-impact`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getImpactB.status).toBe(404);

    // 5. Tenant B cannot access Tenant A pages
    const getPagesB = await request(app)
      .get(`/api/v1/audits/${auditIdA}/pages`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getPagesB.status).toBe(404);
  }, 15_000);
});
