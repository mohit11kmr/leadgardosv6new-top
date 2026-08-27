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

describe('Intelligence API & Multi-Tenant Boundaries (Requirement 12, 13, 14, 15, 16, 32)', () => {
  it('serves score explanations, scenarios, funnel, and WhatsApp optimizer with strict tenant isolation', async () => {
    // 1. Setup Org A
    const orgA = await db.organization.create({
      data: { name: 'Org A Intel', slug: `org-a-intel-${Date.now()}` },
    });
    const userA = await db.user.create({
      data: { email: `user-a-intel-${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' },
    });
    const tokenA = createAccessToken(userA.id, orgA.id);

    // Setup Org B (Attacker / separate tenant)
    const orgB = await db.organization.create({
      data: { name: 'Org B Intel', slug: `org-b-intel-${Date.now()}` },
    });
    const userB = await db.user.create({
      data: { email: `user-b-intel-${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' },
    });
    const tokenB = createAccessToken(userB.id, orgB.id);

    // Create Website and Audit for Org A
    const websiteA = await db.website.create({
      data: {
        organizationId: orgA.id,
        name: 'Site A',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        domain: 'example.com',
      },
    });

    const auditA = await db.audit.create({
      data: {
        organizationId: orgA.id,
        websiteId: websiteA.id,
        status: 'COMPLETED',
        progress: 100,
        progressStage: 'completed',
        businessImpact: {
          kind: 'POTENTIAL_OPPORTUNITY_LOSS',
          confidence: 'HIGH',
          inputs: { monthlyVisitors: 5000, conversionRate: 2.5, averageLeadValue: 500, source: 'USER' },
          estimatedConversionRisk: 0.12,
          estimatedLostOpportunities: 15,
          estimatedOpportunityLoss: 7500,
          currency: 'INR',
          assumptions: ['Verified inputs'],
          methodology: 'Standard formula',
        },
        executiveSummary: {
          headline: '15 at-risk leads detected monthly due to conversion bottlenecks.',
          overallScore: 78,
          pillarScores: { overall: 78, lead: 70, advertising: 90, seo: 80, security: 75 },
          criticalCount: 0,
          highCount: 2,
          mediumCount: 1,
          lowCount: 2,
          topProblems: ['WhatsApp leading zero prefix'],
          priorityFixes: ['Fix WhatsApp destination link'],
          businessImpact: {},
          confidence: 'HIGH',
        },
      },
    });

    await db.auditScore.create({
      data: {
        auditId: auditA.id,
        overall: 78,
        lead: 70,
        advertising: 90,
        seo: 80,
        security: 75,
      },
    });

    await db.auditFinding.create({
      data: {
        auditId: auditA.id,
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_LEADING_ZERO',
        normalizedIssueKey: 'WHATSAPP_LEADING_ZERO',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'WhatsApp leading zero prefix',
        description: 'desc',
        evidence: { source: 'href', observed: 'wa.me/0919876543210', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'Fix WA link',
        scoreImpact: 18,
      },
    });

    // 2. Org A accessing its own intelligence endpoints -> 200 OK
    const resExplanation = await request(app)
      .get(`/api/v1/audits/${auditA.id}/score/explanation`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resExplanation.status).toBe(200);
    expect(resExplanation.body.success).toBe(true);
    expect(resExplanation.body.data.pillars.lead.deductions.length).toBeGreaterThan(0);

    const resScenarios = await request(app)
      .get(`/api/v1/audits/${auditA.id}/scenarios`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resScenarios.status).toBe(200);
    expect(resScenarios.body.success).toBe(true);
    expect(resScenarios.body.data.scenarios).toHaveLength(3);

    const resFunnel = await request(app)
      .get(`/api/v1/audits/${auditA.id}/funnel`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resFunnel.status).toBe(200);
    expect(resFunnel.body.success).toBe(true);
    expect(resFunnel.body.data.stages).toHaveLength(5);

    const resWhatsApp = await request(app)
      .get(`/api/v1/audits/${auditA.id}/whatsapp-optimizer`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resWhatsApp.status).toBe(200);
    expect(resWhatsApp.body.success).toBe(true);
    expect(resWhatsApp.body.data.dimensions.phoneQuality).toBeDefined();

    // 3. Org B attempting to access Org A's intelligence endpoints -> 404 NOT_FOUND (Tenant Isolation)
    const crossExplanation = await request(app)
      .get(`/api/v1/audits/${auditA.id}/score/explanation`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossExplanation.status).toBe(404);

    const crossScenarios = await request(app)
      .get(`/api/v1/audits/${auditA.id}/scenarios`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossScenarios.status).toBe(404);

    const crossFunnel = await request(app)
      .get(`/api/v1/audits/${auditA.id}/funnel`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossFunnel.status).toBe(404);

    const crossWhatsApp = await request(app)
      .get(`/api/v1/audits/${auditA.id}/whatsapp-optimizer`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossWhatsApp.status).toBe(404);
  });
});
