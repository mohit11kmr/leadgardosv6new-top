import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';

describe('Public Audit Resource Limits & Concurrency Gates (Requirement 6, 7)', () => {
  let user: any;
  let org: any;
  let website: any;
  let apiKey: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `audit-limits-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Audit Limits Org', slug: `audit-lim-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const keyRes = await apiKeyService.createApiKey(org.id, user.id, 'Audit Limit Key', [
      'AUDIT_READ',
      'AUDIT_RUN',
    ]);
    apiKey = keyRes.rawKey;

    website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Audit Limit Site',
        url: 'https://audit-limit.com',
        domain: 'audit-limit.com',
        normalizedUrl: 'https://audit-limit.com',
      },
    });
  });

  it('rejects audit creation when organization active concurrent audits limit (10) is reached', async () => {
    // Seed 10 QUEUED audits for this organization
    for (let i = 0; i < 10; i++) {
      await db.audit.create({
        data: {
          organizationId: org.id,
          websiteId: website.id,
          status: 'QUEUED',
        },
      });
    }

    const res = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ websiteId: website.id });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONCURRENT_AUDIT_LIMIT_EXCEEDED');
  });
});
