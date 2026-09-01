import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { processVaultScan } from '../../apps/worker/src/audit/vaultScan.js';

// End-to-end (through the real worker pipeline, not just the pure
// classifyRetestTransitions unit) proof of the LG-040 retest -> verified
// loop: a finding that survives two consecutive clean retests is promoted
// to VERIFIED, not just FIXED. Runs against a fake domain — ALLOW_LOCAL_FIXTURES
// (set globally for tests) makes the crawler return safe canned "Example
// Domain" content with no vulnerable markers, and the host-level debug/backup
// probes fail their DNS lookup and are skipped — so the scan itself always
// detects zero findings, letting us deterministically control what's "live"
// by seeding VaultAuditFinding rows directly.
describe('VaultGuard retest loop: OPEN -> FIXED -> VERIFIED (LG-040)', () => {
  it('promotes a finding to VERIFIED after two consecutive clean retests, and flags one FIXED retest as insufficient', async () => {
    const org = await db.organization.create({
      data: { name: `Retest Loop Org ${Date.now()}`, slug: `retest-loop-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Retest Loop Site',
        url: 'https://retest-loop-fake-domain.test',
        normalizedUrl: 'https://retest-loop-fake-domain.test',
        domain: 'retest-loop-fake-domain.test',
      },
    });

    const initialRun = await db.vaultAuditRun.create({
      data: { organizationId: org.id, websiteId: website.id, mode: 'STANDARD', status: 'QUEUED' },
    });
    const finding = await db.vaultAuditFinding.create({
      data: {
        runId: initialRun.id,
        websiteId: website.id,
        scannerKey: 'SEC_DEBUG_MODE',
        normalizedIssueKey: 'SEC_DEBUG_MODE',
        severity: 'CRITICAL',
        title: 'Debug mode enabled',
        description: 'desc',
        evidence: {},
        recommendation: 'rec',
        scoreImpact: 30,
        status: 'OPEN',
      },
    });

    // First retest: the (fixture) scan detects nothing -> OPEN becomes FIXED.
    const retest1 = await db.vaultAuditRun.create({
      data: { organizationId: org.id, websiteId: website.id, mode: 'RETEST', status: 'QUEUED' },
    });
    const result1 = await processVaultScan(retest1.id, new AbortController().signal);
    expect(result1.fixedFindings).toBe(1);
    expect(result1.verifiedFindings).toBe(0);

    const afterRetest1 = await db.vaultAuditFinding.findUniqueOrThrow({ where: { id: finding.id } });
    expect(afterRetest1.status).toBe('FIXED');

    // Second consecutive clean retest: still nothing detected -> FIXED becomes VERIFIED.
    const retest2 = await db.vaultAuditRun.create({
      data: { organizationId: org.id, websiteId: website.id, mode: 'RETEST', status: 'QUEUED' },
    });
    const result2 = await processVaultScan(retest2.id, new AbortController().signal);
    expect(result2.fixedFindings).toBe(0);
    expect(result2.verifiedFindings).toBe(1);

    const afterRetest2 = await db.vaultAuditFinding.findUniqueOrThrow({ where: { id: finding.id } });
    expect(afterRetest2.status).toBe('VERIFIED');

    // Confirm the completed run rows themselves record the counts too.
    const retest2Row = await db.vaultAuditRun.findUniqueOrThrow({ where: { id: retest2.id } });
    expect(retest2Row.verifiedFindings).toBe(1);

    // The findings-list API's status filter must accept VERIFIED (it was
    // previously missing from the enum, so a client could never query for
    // it even though the DB enum and worker fully support the status).
    const user = await db.user.create({ data: { email: `retest-loop-${Date.now()}@example.com`, passwordHash: 'hash' } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    const token = createAccessToken(user.id, org.id);

    const res = await request(app)
      .get(`/api/v1/websites/${website.id}/security-audit/${initialRun.id}/findings?status=VERIFIED`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((f: any) => f.id === finding.id)).toBe(true);
  }, 30_000);
});
