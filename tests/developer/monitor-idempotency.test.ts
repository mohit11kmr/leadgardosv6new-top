import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';

describe('Public Monitoring Execution Idempotency & Active Concurrency Gate (Requirement 4, 5)', () => {
  let user: any;
  let org: any;
  let website: any;
  let monitor: any;
  let apiKey: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `mon-idem-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Mon Idem Org', slug: `mon-idem-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const keyRes = await apiKeyService.createApiKey(org.id, user.id, 'Mon Key', [
      'MONITORING_READ',
      'MONITORING_RUN',
    ]);
    apiKey = keyRes.rawKey;

    website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Mon Test Site',
        url: 'https://mon-test.com',
        domain: 'mon-test.com',
        normalizedUrl: 'https://mon-test.com',
      },
    });

    monitor = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        enabled: true,
        frequency: 'FIVE_MINUTES',
      },
    });
  });

  it('reuses existing execution when Idempotency-Key is provided', async () => {
    const key = `run-idem-${Date.now()}`;

    const res1 = await request(app)
      .post(`/api/v1/public/monitors/${monitor.id}/run`)
      .set('Authorization', `Bearer ${apiKey}`)
      .set('Idempotency-Key', key);

    expect(res1.status).toBe(200);
    expect(res1.body.data.status).toBe('QUEUED');
    const jobId1 = res1.body.data.jobId;

    // Second request with same idempotency key
    const res2 = await request(app)
      .post(`/api/v1/public/monitors/${monitor.id}/run`)
      .set('Authorization', `Bearer ${apiKey}`)
      .set('Idempotency-Key', key);

    expect(res2.status).toBe(200);
    expect(res2.body.data.jobId).toBe(jobId1);
  });

  it('rejects concurrent un-idempotent monitor execution with 409 MONITOR_RUN_IN_PROGRESS', async () => {
    // 1. Initial manual run without idempotency key
    const res1 = await request(app)
      .post(`/api/v1/public/monitors/${monitor.id}/run`)
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res1.status).toBe(200);

    // 2. Second request while initial run is still active in QUEUED/RUNNING status
    const res2 = await request(app)
      .post(`/api/v1/public/monitors/${monitor.id}/run`)
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error.code).toBe('MONITOR_RUN_IN_PROGRESS');
  });
});
