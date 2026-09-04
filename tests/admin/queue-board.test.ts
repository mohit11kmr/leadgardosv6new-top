import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { webhookQueue } from '../../apps/api/src/services/outboxService.js';

async function makePlatformAdmin(capabilities: string[]) {
  const user = await db.user.create({
    data: {
      email: `queue_admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: 'hash',
      platformAdmin: true,
      platformCapabilities: capabilities,
    },
  });
  const org = await db.organization.create({ data: { name: `Queue Admin Org ${user.id}`, slug: `queue-admin-${user.id}` } });
  const token = createAccessToken(user.id, org.id);
  return { user, token };
}

describe('GET /admin/queues — operator visibility', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/admin/queues/api/queues');
    expect(res.status).toBe(401);
  });

  it('rejects a platformAdmin with no OPERATIONS_VIEW capability', async () => {
    const { token } = await makePlatformAdmin([]);
    const res = await request(app).get('/api/v1/admin/queues/api/queues').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('permits a platformAdmin with OPERATIONS_VIEW to view queue state', async () => {
    const { token } = await makePlatformAdmin(['OPERATIONS_VIEW']);
    const res = await request(app).get('/api/v1/admin/queues/api/queues').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Bull Board's own queues-overview payload — verify our real, existing
    // queue names are enumerated (not a hardcoded/fake list).
    const body = JSON.stringify(res.body);
    expect(body).toContain('audit');
    expect(body).toContain('webhook');
  });

  it('rejects a mutation (non-GET) from a user with only OPERATIONS_VIEW, not OPERATIONS_MANAGE', async () => {
    const { token } = await makePlatformAdmin(['OPERATIONS_VIEW']);
    const res = await request(app)
      .put('/api/v1/admin/queues/api/queues/audit/retry/failed')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('never exposes the webhook queue\'s signing secret hash in job details', async () => {
    const { token } = await makePlatformAdmin(['OPERATIONS_VIEW']);
    const jobId = `test-job-${Date.now()}`;
    await webhookQueue.add(
      'deliver-webhook',
      {
        deliveryId: `test-delivery-${Date.now()}`,
        webhookEndpointId: 'test-endpoint',
        organizationId: 'test-org',
        eventType: 'PING',
        url: 'https://example.test/webhook',
        secretHash: 'THIS-SECRET-MUST-NEVER-APPEAR-IN-THE-RESPONSE',
        payload: { event: 'PING' },
        timestamp: Math.floor(Date.now() / 1000),
      },
      { jobId }
    );

    const res = await request(app).get(`/api/v1/admin/queues/api/queues/webhook/${jobId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('THIS-SECRET-MUST-NEVER-APPEAR-IN-THE-RESPONSE');
    expect(JSON.stringify(res.body)).toContain('[REDACTED]');
  });

  it('creates an AdminAuditLog entry for a mutation attempt with OPERATIONS_MANAGE', async () => {
    const { user, token } = await makePlatformAdmin(['OPERATIONS_MANAGE']);
    await request(app)
      .put('/api/v1/admin/queues/api/queues/audit/retry/failed')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const log = await db.adminAuditLog.findFirst({ where: { userId: user.id, action: 'QUEUE_PUT' }, orderBy: { createdAt: 'desc' } });
    expect(log).toBeTruthy();
  });

  it('does not audit-log a plain GET (view) request', async () => {
    const { user, token } = await makePlatformAdmin(['OPERATIONS_VIEW']);
    const before = await db.adminAuditLog.count({ where: { userId: user.id } });
    await request(app).get('/api/v1/admin/queues/api/queues').set('Authorization', `Bearer ${token}`);
    const after = await db.adminAuditLog.count({ where: { userId: user.id } });
    expect(after).toBe(before);
  });
});
