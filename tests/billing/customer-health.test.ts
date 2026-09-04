import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { customerHealthService } from '../../apps/api/src/services/customerHealthService.js';

async function makeOrg() {
  return db.organization.create({ data: { name: `Health Org ${Date.now()}`, slug: `health-org-${Date.now()}-${Math.random()}` } });
}

describe('CustomerHealthService', () => {
  it('scores AT_RISK for an org with no active subscription and no websites, and is explainable', async () => {
    const org = await makeOrg();
    const result = await customerHealthService.computeHealth(org.id);
    expect(result.band).toBe('AT_RISK');
    expect(result.provisional).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.includes('subscription'))).toBe(true);
    expect(result.trend.status).toBe('NOT_AVAILABLE');
  });

  it('scores HEALTHY for an actively-engaged org with an active subscription, monitoring, and no unresolved critical findings', async () => {
    const org = await makeOrg();
    const plan = await db.plan.create({
      data: { code: `health-plan-${Date.now()}`, name: 'Health Plan', priceInPaise: 999900, entitlements: {} },
    });
    await db.subscription.create({ data: { organizationId: org.id, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 20 * 86400000) } });
    const website = await db.website.create({
      data: { organizationId: org.id, name: 'Site', url: 'https://example.test', normalizedUrl: 'https://example.test', domain: 'example.test' },
    });
    await db.audit.create({ data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED' } });
    await db.monitoringConfig.create({ data: { organizationId: org.id, websiteId: website.id, enabled: true, frequency: 'DAILY' } });

    const result = await customerHealthService.computeHealth(org.id);
    expect(result.band).toBe('HEALTHY');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('penalizes unresolved critical findings in the most recent audit and surfaces the exact count in reasons', async () => {
    const org = await makeOrg();
    const website = await db.website.create({
      data: { organizationId: org.id, name: 'Site', url: 'https://example.test', normalizedUrl: 'https://example.test', domain: 'example.test' },
    });
    const audit = await db.audit.create({ data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED' } });
    await db.auditFinding.create({
      data: { auditId: audit.id, ruleId: 'r1', category: 'SECURITY', severity: 'CRITICAL', title: 't', description: 'd', evidence: {}, recommendation: 'r', scoreImpact: 1 },
    });
    await db.auditFinding.create({
      data: { auditId: audit.id, ruleId: 'r2', category: 'SECURITY', severity: 'CRITICAL', title: 't', description: 'd', evidence: {}, recommendation: 'r', scoreImpact: 1 },
    });

    const result = await customerHealthService.computeHealth(org.id);
    expect(result.signals.unresolvedCriticalFindings).toBe(2);
    expect(result.reasons.some((r) => r.includes('2 critical'))).toBe(true);
  });

  it('never fabricates a trend — always reports NOT_AVAILABLE since no historical snapshot exists', async () => {
    const org = await makeOrg();
    const result = await customerHealthService.computeHealth(org.id);
    expect(result.trend.status).toBe('NOT_AVAILABLE');
  });
});
