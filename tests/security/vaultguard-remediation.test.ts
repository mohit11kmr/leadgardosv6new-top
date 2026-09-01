import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('GET /websites/:id/security-audit/:runId/findings/:findingId/remediation (LG-039)', () => {
  let orgId: string;
  let websiteId: string;
  let ownerToken: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `Remediation Org ${Date.now()}`, slug: `remediation-org-${Date.now()}` },
    });
    orgId = org.id;

    const proPlan = await db.plan.upsert({
      where: { code: 'PRO' },
      create: {
        code: 'PRO',
        name: 'Pro',
        priceInPaise: 499900,
        currency: 'INR',
        entitlements: { auditsPerMonth: 100, websites: 5, monitoring: true, apiAccess: true, whiteLabel: false, reports: 50, prospectLimit: 100 },
      },
      update: {},
    });
    await db.subscription.create({ data: { organizationId: org.id, planId: proPlan.id, status: 'ACTIVE' } });

    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Remediation Target',
        url: 'https://remediation.test',
        normalizedUrl: 'https://remediation.test',
        domain: 'remediation.test',
      },
    });
    websiteId = website.id;

    const owner = await db.user.create({ data: { email: `remediation_owner_${Date.now()}@example.com`, passwordHash: 'hash' } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER' } });
    ownerToken = createAccessToken(owner.id, org.id);
  });

  it('returns Hinglish summary/impact/mitigation for a known detection key', async () => {
    const run = await db.vaultAuditRun.create({
      data: { organizationId: orgId, websiteId, mode: 'STANDARD', status: 'COMPLETED' },
    });
    const finding = await db.vaultAuditFinding.create({
      data: {
        runId: run.id,
        websiteId,
        scannerKey: 'SEC_DEBUG_MODE',
        normalizedIssueKey: 'SEC_DEBUG_MODE',
        severity: 'CRITICAL',
        title: 'Debug mode enabled',
        description: 'desc',
        evidence: {},
        recommendation: 'rec',
        scoreImpact: 30,
      },
    });

    const res = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit/${run.id}/findings/${finding.id}/remediation`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.detectionKey).toBe('SEC_DEBUG_MODE');
    expect(res.body.data.summaryHi.length).toBeGreaterThan(10);
    expect(res.body.data.mitigationSteps.length).toBeGreaterThan(0);
  });

  it('returns 404 with NO_REMEDIATION_GUIDE for an unrecognized detection key', async () => {
    const run = await db.vaultAuditRun.create({
      data: { organizationId: orgId, websiteId, mode: 'STANDARD', status: 'COMPLETED' },
    });
    const finding = await db.vaultAuditFinding.create({
      data: {
        runId: run.id,
        websiteId,
        scannerKey: 'SOME_FUTURE_KEY',
        normalizedIssueKey: 'SOME_FUTURE_KEY',
        severity: 'LOW',
        title: 'Unknown',
        description: 'desc',
        evidence: {},
        recommendation: 'rec',
        scoreImpact: 1,
      },
    });

    const res = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit/${run.id}/findings/${finding.id}/remediation`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_REMEDIATION_GUIDE');
  });

  it('returns 404 for a finding belonging to another organization', async () => {
    const otherOrg = await db.organization.create({ data: { name: `Other Org ${Date.now()}`, slug: `other-org-${Date.now()}` } });
    const otherWebsite = await db.website.create({
      data: { organizationId: otherOrg.id, name: 'Other Site', url: 'https://other.test', normalizedUrl: 'https://other.test', domain: 'other.test' },
    });
    const otherRun = await db.vaultAuditRun.create({ data: { organizationId: otherOrg.id, websiteId: otherWebsite.id, mode: 'STANDARD', status: 'COMPLETED' } });
    const otherFinding = await db.vaultAuditFinding.create({
      data: {
        runId: otherRun.id,
        websiteId: otherWebsite.id,
        scannerKey: 'SEC_DEBUG_MODE',
        normalizedIssueKey: 'SEC_DEBUG_MODE',
        severity: 'CRITICAL',
        title: 'Debug mode enabled',
        description: 'desc',
        evidence: {},
        recommendation: 'rec',
        scoreImpact: 30,
      },
    });

    const res = await request(app)
      .get(`/api/v1/websites/${otherWebsite.id}/security-audit/${otherRun.id}/findings/${otherFinding.id}/remediation`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});
