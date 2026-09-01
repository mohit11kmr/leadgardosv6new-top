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
import { systemGuestOrganizationService } from '../apps/api/src/services/systemGuestOrganizationService.js';

// Regression for a real conversion-funnel bug: the free/guest scan capped
// its `findings` relation at 5 rows (the intended teaser), but computed
// `totalFindings` from that same capped array's length — so a visitor whose
// site had, say, 23 issues would only ever be told "5", with no signal that
// 18 more exist. That silently killed the "N more issues — sign up to
// unlock" conversion hook. Fixed by counting the true total separately.
describe('Free scan teaser: totalFindings and lockedFindingsCount', () => {
  it('reports the true total finding count and the correct locked count when there are more than the 5 shown', async () => {
    const guestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();

    const website = await db.website.create({
      data: {
        organizationId: guestOrgId,
        name: 'Teaser Test Site',
        url: 'https://teaser-test.example',
        normalizedUrl: 'https://teaser-test.example',
        domain: 'teaser-test.example',
      },
    });

    const audit = await db.audit.create({
      data: { organizationId: guestOrgId, websiteId: website.id, status: 'COMPLETED', progress: 100 },
    });

    await db.auditScore.create({
      data: { auditId: audit.id, overall: 40, lead: 40, advertising: 40, seo: 40, security: 40 },
    });

    // 8 findings — more than the free-scan cap of 5.
    await db.auditFinding.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        auditId: audit.id,
        ruleId: 'LG-001',
        internalKey: `TEASER_TEST_${i}`,
        normalizedIssueKey: `TEASER_TEST_${i}`,
        category: 'LEAD' as const,
        scope: 'WEBSITE' as const,
        severity: 'HIGH' as const,
        title: `Test finding ${i}`,
        description: 'desc',
        evidence: { source: 'test', observed: '', location: '', why: '', recommendation: '' },
        recommendation: 'rec',
        scoreImpact: 5,
      })),
    });

    const res = await request(app).get(`/api/v1/public/scan/${audit.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.findings).toHaveLength(5);
    expect(res.body.data.totalFindings).toBe(8);
    expect(res.body.data.lockedFindingsCount).toBe(3);
  });

  it('reports zero locked findings when the total is within the free cap', async () => {
    const guestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();

    const website = await db.website.create({
      data: {
        organizationId: guestOrgId,
        name: 'Teaser Test Site 2',
        url: 'https://teaser-test-2.example',
        normalizedUrl: 'https://teaser-test-2.example',
        domain: 'teaser-test-2.example',
      },
    });
    const audit = await db.audit.create({
      data: { organizationId: guestOrgId, websiteId: website.id, status: 'COMPLETED', progress: 100 },
    });
    await db.auditFinding.create({
      data: {
        auditId: audit.id,
        ruleId: 'LG-001',
        internalKey: 'TEASER_SINGLE',
        normalizedIssueKey: 'TEASER_SINGLE',
        category: 'LEAD',
        scope: 'WEBSITE',
        severity: 'LOW',
        title: 'Single finding',
        description: 'desc',
        evidence: { source: 'test', observed: '', location: '', why: '', recommendation: '' },
        recommendation: 'rec',
        scoreImpact: 2,
      },
    });

    const res = await request(app).get(`/api/v1/public/scan/${audit.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalFindings).toBe(1);
    expect(res.body.data.lockedFindingsCount).toBe(0);
  });
});
