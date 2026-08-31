import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('VaultGuard: branded security report variant (LG-006/LG-007)', () => {
  let orgId: string;
  let websiteId: string;
  let runId: string;
  let token: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `Vault Rpt Org ${Date.now()}`, slug: `vault-rpt-${Date.now()}` },
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
        name: 'Vault Target',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        domain: 'example.com',
      },
    });
    websiteId = website.id;

    // Simulate a completed, scanned run with findings (worker not run in tests)
    const run = await db.vaultAuditRun.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        mode: 'STANDARD',
        status: 'COMPLETED',
        score: 82,
        findingsCount: 1,
        pagesDiscovered: 5,
        pagesFetched: 4,
        startedAt: new Date(),
        completedAt: new Date(),
        durationMs: 900,
      },
    });
    runId = run.id;

    await db.vaultAuditFinding.create({
      data: {
        runId: run.id,
        websiteId: website.id,
        scannerKey: 'SEC_SERVER_LEAK',
        normalizedIssueKey: 'SEC_SERVER_LEAK',
        severity: 'MEDIUM',
        title: 'Server/framework version disclosure',
        description: 'Response discloses server version',
        evidence: { source: 'vault-probe', observed: 'x-powered-by: PHP/8.4.24', location: 'https://example.com/' },
        affectedUrl: 'https://example.com/',
        recommendation: 'Hide the server banner',
        scoreImpact: 6,
        cwe: 'CWE-200',
        cvssScore: 5.3,
      },
    });

    const owner = await db.user.create({ data: { email: `vault_rpt_owner_${Date.now()}@example.com`, passwordHash: 'hash' } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, role: 'OWNER' } });
    token = createAccessToken(owner.id, org.id);
  });

  it('generates and retrieves a branded SECURITY report for a completed run', async () => {
    const create = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit/${runId}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Acme Security Audit' });
    expect(create.status).toBe(201);
    const report = create.body.data;
    expect(report.auditId).toBeNull();
    expect(report.vaultRunId).toBe(runId);
    expect(report.snapshotData.reportType).toBe('SECURITY');
    expect(report.snapshotData.website.id).toBe(websiteId);
    expect(report.snapshotData.run.score).toBe(82);
    expect(report.snapshotData.findings).toHaveLength(1);
    expect(report.snapshotData.findings[0].normalizedIssueKey).toBeUndefined();
    expect(report.snapshotData.findings[0].title).toBe('Server/framework version disclosure');
    expect(report.snapshotData.branding.companyName).toBeTruthy();
    expect(report.snapshotData.summary.severityCounts.MEDIUM).toBe(1);

    const getRunReport = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit/${runId}/report`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRunReport.status).toBe(200);
    expect(getRunReport.body.data.id).toBe(report.id);

    // Generic report endpoints (share + pdf) accept the vault report
    const share = await request(app)
      .post(`/api/v1/reports/${report.id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(share.status).toBe(201);
    expect(share.body.data.rawToken).toBeTruthy();

    const pdf = await request(app)
      .post(`/api/v1/reports/${report.id}/pdf`)
      .set('Authorization', `Bearer ${token}`);
    expect(pdf.status).toBe(200);
    expect(pdf.body.data.status).toBe('QUEUED');
  });
});
