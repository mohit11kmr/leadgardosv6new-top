import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { entitlementService } from '../../apps/api/src/services/entitlementService.js';

describe('Billing: Plan Quota Enforcement & Entitlements (Requirement 8, 24, 26, 38)', () => {
  it('enforces monthly audit and website quotas returning PLAN_LIMIT_REACHED when exhausted', async () => {
    const org = await db.organization.create({
      data: { name: 'Quota Org', slug: `quota-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `quota_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const token = createAccessToken(user.id, org.id);

    // Free plan allows 1 website and 3 audits/month
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Allowed Site',
        url: 'https://site-1.test',
        normalizedUrl: 'https://site-1.test',
        domain: 'site-1.test',
      },
    });

    // 1. Attempting to add a 2nd website on Free tier fails (Quota = 1)
    const blockedSiteRes = await request(app)
      .post('/api/v1/websites')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Blocked Site 2', url: 'https://site-2.test' });

    expect(blockedSiteRes.status).toBe(403);
    expect(blockedSiteRes.body.error.code).toBe('PLAN_LIMIT_REACHED');

    // 2. Simulate exhausting audit quota (3 audits on Free tier)
    await entitlementService.recordUsage(org.id, 'AUDITS', 3);

    // 3. Attempting to start audit fails with PLAN_LIMIT_REACHED
    const blockedAuditRes = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${token}`)
      .send({ websiteId: website.id });

    expect(blockedAuditRes.status).toBe(403);
    expect(blockedAuditRes.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });
});
