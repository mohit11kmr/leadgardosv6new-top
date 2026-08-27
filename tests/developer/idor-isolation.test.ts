import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';
import { reportService } from '../../apps/api/src/services/reportService.js';

describe('Public API Tenant Isolation & IDOR Protection (Requirement 10, 11)', () => {
  let userA: any;
  let userB: any;
  let orgA: any;
  let orgB: any;
  let apiKeyA: string;
  let apiKeyB: string;
  let auditB: any;
  let reportB: any;
  let monitorB: any;

  beforeEach(async () => {
    userA = await db.user.create({
      data: { email: `user-a-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    userB = await db.user.create({
      data: { email: `user-b-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });

    orgA = await db.organization.create({
      data: { name: 'Org A', slug: `orga-${Date.now()}-${Math.random()}` },
    });
    orgB = await db.organization.create({
      data: { name: 'Org B', slug: `orgb-${Date.now()}-${Math.random()}` },
    });

    await db.organizationMember.create({
      data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' },
    });

    const keyARes = await apiKeyService.createApiKey(orgA.id, userA.id, 'Key A', [
      'AUDIT_READ',
      'AUDIT_RUN',
      'REPORT_READ',
      'MONITORING_READ',
      'MONITORING_RUN',
    ]);
    apiKeyA = keyARes.rawKey;

    const keyBRes = await apiKeyService.createApiKey(orgB.id, userB.id, 'Key B', [
      'AUDIT_READ',
      'AUDIT_RUN',
      'REPORT_READ',
      'MONITORING_READ',
      'MONITORING_RUN',
    ]);
    apiKeyB = keyBRes.rawKey;

    const websiteB = await db.website.create({
      data: {
        organizationId: orgB.id,
        name: 'Site B',
        url: 'https://site-b.com',
        domain: 'site-b.com',
        normalizedUrl: 'https://site-b.com',
      },
    });

    auditB = await db.audit.create({
      data: {
        organizationId: orgB.id,
        websiteId: websiteB.id,
        status: 'COMPLETED',
      },
    });

    reportB = await reportService.createReportSnapshot(orgB.id, auditB.id);

    monitorB = await db.monitoringConfig.create({
      data: {
        organizationId: orgB.id,
        websiteId: websiteB.id,
        enabled: true,
        frequency: 'FIVE_MINUTES',
      },
    });
  });

  it('prevents API Key A from reading Org B audit and returns 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get(`/api/v1/public/audits/${auditB.id}`)
      .set('Authorization', `Bearer ${apiKeyA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('prevents API Key A from reading Org B report and returns 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get(`/api/v1/public/reports/${reportB.id}`)
      .set('Authorization', `Bearer ${apiKeyA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('prevents API Key A from reading Org B monitor status and returns 404 NOT_FOUND', async () => {
    const res = await request(app)
      .get(`/api/v1/public/monitors/${monitorB.id}/status`)
      .set('Authorization', `Bearer ${apiKeyA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('prevents API Key A from triggering health check on Org B monitor', async () => {
    const res = await request(app)
      .post(`/api/v1/public/monitors/${monitorB.id}/run`)
      .set('Authorization', `Bearer ${apiKeyA}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
