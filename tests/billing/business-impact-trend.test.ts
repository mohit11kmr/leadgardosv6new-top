import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { businessImpactTrendService, resolveTrendPeriod } from '../../apps/api/src/services/businessImpactTrendService.js';

async function makeOrgWithWebsite() {
  const org = await db.organization.create({ data: { name: `Trend Org ${Date.now()}`, slug: `trend-org-${Date.now()}-${Math.random()}` } });
  const website = await db.website.create({
    data: { organizationId: org.id, name: 'Site', url: 'https://example.test', normalizedUrl: 'https://example.test', domain: 'example.test' },
  });
  return { org, website };
}

function impact(estimatedOpportunityLoss: number) {
  return {
    kind: 'POTENTIAL_OPPORTUNITY_LOSS',
    confidence: 'MEDIUM',
    inputs: { monthlyVisitors: 5000, conversionRate: 2.5, averageLeadValue: 500, source: 'DEFAULT' },
    estimatedConversionRisk: 0.1,
    estimatedLostOpportunities: 12,
    estimatedOpportunityLoss,
    currency: 'INR',
    assumptions: [],
    methodology: 'test-fixture',
  };
}

describe('BusinessImpactTrendService', () => {
  it('returns INSUFFICIENT_DATA (not zero) when no completed audits exist in the period', async () => {
    const { org } = await makeOrgWithWebsite();
    const result = await businessImpactTrendService.getTrend(org.id, { period: resolveTrendPeriod({ days: 30 }) });
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.estimatedRiskFirst).toBeNull();
    expect(result.summary).not.toContain('0');
  });

  it('computes first/latest/min/max/change across multiple audits, and never uses Payment data', async () => {
    const { org, website } = await makeOrgWithWebsite();
    const now = Date.now();
    await db.audit.create({
      data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED', businessImpact: impact(10000) as any, createdAt: new Date(now - 20 * 86400000) },
    });
    await db.audit.create({
      data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED', businessImpact: impact(4000) as any, createdAt: new Date(now - 5 * 86400000) },
    });

    const result = await businessImpactTrendService.getTrend(org.id, { period: resolveTrendPeriod({ days: 30 }) });
    expect(result.status).toBe('AVAILABLE');
    expect(result.auditsInPeriod).toBe(2);
    expect(result.estimatedRiskFirst).toBe(10000);
    expect(result.estimatedRiskLatest).toBe(4000);
    expect(result.estimatedRiskMin).toBe(4000);
    expect(result.estimatedRiskMax).toBe(10000);
    expect(result.observedChange).toBe(-6000);
    expect(result.summary.toLowerCase()).toContain('improved');
  });

  it('computes findingsResolved and findingsIntroduced by diffing normalizedIssueKey sets between first and latest audit', async () => {
    const { org, website } = await makeOrgWithWebsite();
    const now = Date.now();
    const auditFirst = await db.audit.create({
      data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED', businessImpact: impact(8000) as any, createdAt: new Date(now - 10 * 86400000) },
    });
    const auditLatest = await db.audit.create({
      data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED', businessImpact: impact(3000) as any, createdAt: new Date(now - 1 * 86400000) },
    });
    await db.auditFinding.create({
      data: { auditId: auditFirst.id, ruleId: 'r1', category: 'LEAD', severity: 'HIGH', title: 't', description: 'd', evidence: {}, recommendation: 'r', scoreImpact: 1, normalizedIssueKey: 'ISSUE_A' },
    });
    await db.auditFinding.create({
      data: { auditId: auditFirst.id, ruleId: 'r2', category: 'LEAD', severity: 'HIGH', title: 't', description: 'd', evidence: {}, recommendation: 'r', scoreImpact: 1, normalizedIssueKey: 'ISSUE_B' },
    });
    await db.auditFinding.create({
      data: { auditId: auditLatest.id, ruleId: 'r2', category: 'LEAD', severity: 'HIGH', title: 't', description: 'd', evidence: {}, recommendation: 'r', scoreImpact: 1, normalizedIssueKey: 'ISSUE_B' },
    });
    await db.auditFinding.create({
      data: { auditId: auditLatest.id, ruleId: 'r3', category: 'LEAD', severity: 'HIGH', title: 't', description: 'd', evidence: {}, recommendation: 'r', scoreImpact: 1, normalizedIssueKey: 'ISSUE_C' },
    });

    const result = await businessImpactTrendService.getTrend(org.id, { period: resolveTrendPeriod({ days: 30 }) });
    expect(result.findingsResolved).toBe(1); // ISSUE_A present first, gone latest
    expect(result.findingsIntroduced).toBe(1); // ISSUE_C absent first, present latest
  });

  it('never claims "revenue recovered" or "money saved" in the customer-facing summary or field names (the disclaimer itself may name and reject those phrases)', async () => {
    const { org, website } = await makeOrgWithWebsite();
    await db.audit.create({
      data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED', businessImpact: impact(5000) as any },
    });
    const result = await businessImpactTrendService.getTrend(org.id, { period: resolveTrendPeriod({ days: 30 }) });
    expect(result.summary.toLowerCase()).not.toContain('revenue recovered');
    expect(result.summary.toLowerCase()).not.toContain('money saved');
    const fieldNames = Object.keys(result).join(' ').toLowerCase();
    expect(fieldNames).not.toContain('revenuerecovered');
    expect(fieldNames).not.toContain('moneysaved');
    // The disclaimer is expected to explicitly name and reject this framing.
    expect(result.disclaimer.toLowerCase()).toContain('revenue recovered');
  });

  it('rejects an invalid custom range where end <= start', () => {
    expect(() => resolveTrendPeriod({ start: '2026-01-05', end: '2026-01-01' })).toThrow();
  });
});
