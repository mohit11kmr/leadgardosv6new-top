process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL = 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL = 'redis://localhost:16380';
process.env.JWT_SECRET = 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);
process.env.APP_URL = 'http://localhost:5173';
process.env.API_URL = 'http://localhost:4000';

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../apps/api/src/server.js';
import { createAccessToken } from '../apps/api/src/auth.js';

describe('GET /audits/:id/auto-fix-scripts', () => {
  it('returns copy-paste scripts for fixable findings and flags manual-fix-required ones separately', async () => {
    const org = await db.organization.create({
      data: { name: 'Auto-Fix Org', slug: `auto-fix-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `auto-fix-${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    const token = createAccessToken(user.id, org.id);

    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Auto-Fix Site',
        url: 'https://auto-fix.test',
        normalizedUrl: 'https://auto-fix.test',
        domain: 'auto-fix.test',
      },
    });
    const audit = await db.audit.create({
      data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED', progress: 100 },
    });

    await db.auditFinding.createMany({
      data: [
        {
          auditId: audit.id,
          ruleId: 'LG-007',
          internalKey: 'GA4_MISSING',
          normalizedIssueKey: 'GA4_MISSING',
          category: 'ADVERTISING',
          scope: 'WEBSITE',
          severity: 'LOW',
          title: 'GA4 missing',
          description: 'desc',
          evidence: { source: 'test', observed: '', location: '', why: '', recommendation: '' },
          recommendation: 'rec',
          scoreImpact: 4,
        },
        {
          auditId: audit.id,
          ruleId: 'LG-013',
          internalKey: 'SEC_HEADER_HSTS',
          normalizedIssueKey: 'SEC_HEADER_HSTS',
          category: 'SECURITY',
          scope: 'WEBSITE',
          severity: 'HIGH',
          title: 'HSTS missing',
          description: 'desc',
          evidence: { source: 'test', observed: '', location: '', why: '', recommendation: '' },
          recommendation: 'rec',
          scoreImpact: 10,
        },
      ],
    });

    const res = await request(app)
      .get(`/api/v1/audits/${audit.id}/auto-fix-scripts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.scripts).toHaveLength(1);
    expect(res.body.data.scripts[0].internalKey).toBe('GA4_MISSING');
    expect(res.body.data.scripts[0].snippet).toContain('G-XXXXXXXXXX');
    expect(res.body.data.manualFixRequired).toHaveLength(1);
    expect(res.body.data.manualFixRequired[0].internalKey).toBe('SEC_HEADER_HSTS');
  });

  it('enforces tenant isolation: another org cannot fetch these scripts', async () => {
    const orgA = await db.organization.create({ data: { name: 'AF Org A', slug: `af-org-a-${Date.now()}` } });
    const userA = await db.user.create({ data: { email: `af-a-${Date.now()}@example.com`, passwordHash: 'hash' } });
    await db.organizationMember.create({ data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' } });

    const websiteA = await db.website.create({
      data: { organizationId: orgA.id, name: 'AF Site A', url: 'https://af-a.test', normalizedUrl: 'https://af-a.test', domain: 'af-a.test' },
    });
    const auditA = await db.audit.create({ data: { organizationId: orgA.id, websiteId: websiteA.id, status: 'COMPLETED', progress: 100 } });

    const orgB = await db.organization.create({ data: { name: 'AF Org B', slug: `af-org-b-${Date.now()}` } });
    const userB = await db.user.create({ data: { email: `af-b-${Date.now()}@example.com`, passwordHash: 'hash' } });
    await db.organizationMember.create({ data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' } });
    const tokenB = createAccessToken(userB.id, orgB.id);

    const res = await request(app)
      .get(`/api/v1/audits/${auditA.id}/auto-fix-scripts`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});
