import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { processAudit } from '../apps/worker/src/audit.js';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL ??= 'redis://localhost:16380';
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.APP_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';

describe('Worker Retry Idempotency & AuditRun Lifecycle (Requirement 33)', () => {
  it('persists AuditPage and AuditRun, and handles worker retries idempotently', async () => {
    // Create test org, website, and audit directly in DB
    const org = await db.organization.create({
      data: { name: 'Retry Test Org', slug: `retry-test-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Retry Test Site',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        domain: 'example.com',
      },
    });
    const audit = await db.audit.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        status: 'QUEUED',
      },
    });

    // Run 1: execute processAudit
    const controller1 = new AbortController();
    const result1 = await processAudit(audit.id, controller1.signal);
    expect(['COMPLETED', 'PARTIAL']).toContain(result1.status);

    // Verify AuditPage rows persisted
    const pagesRun1 = await db.auditPage.findMany({ where: { auditId: audit.id } });
    expect(pagesRun1.length).toBeGreaterThan(0);
    expect(pagesRun1[0]?.htmlAvailable).toBe(true);

    // Verify AuditRun recorded
    const runsAfter1 = await db.auditRun.findMany({ where: { auditId: audit.id } });
    expect(runsAfter1.length).toBe(1);
    expect(runsAfter1[0]?.status).toBe(result1.status);
    expect(runsAfter1[0]?.startedAt).toBeInstanceOf(Date);
    expect(runsAfter1[0]?.completedAt).toBeInstanceOf(Date);

    // Verify AuditFinding rows persisted with valid scopes
    const findings1 = await db.auditFinding.findMany({ where: { auditId: audit.id } });
    expect(findings1.length).toBeGreaterThan(0);
    expect(findings1.some((f) => f.scope === 'WEBSITE')).toBe(true);

    // Verify AuditScore created
    const score1 = await db.auditScore.findUnique({ where: { auditId: audit.id } });
    expect(score1).not.toBeNull();
    expect(score1?.overall).toBeGreaterThanOrEqual(0);

    // Run 2: simulate worker retry on the exact same auditId
    const controller2 = new AbortController();
    const result2 = await processAudit(audit.id, controller2.signal);
    expect(['COMPLETED', 'PARTIAL']).toContain(result2.status);

    // Verify no duplicated AuditPages (same count)
    const pagesRun2 = await db.auditPage.findMany({ where: { auditId: audit.id } });
    expect(pagesRun2.length).toBe(pagesRun1.length);

    // Verify distinct execution history in AuditRun (now 2 runs)
    const runsAfter2 = await db.auditRun.findMany({ where: { auditId: audit.id } });
    expect(runsAfter2.length).toBe(2);

    // Verify findings are not duplicated
    const findings2 = await db.auditFinding.findMany({ where: { auditId: audit.id } });
    expect(findings2.length).toBe(findings1.length);

    // Verify scores remain consistent
    const score2 = await db.auditScore.findUnique({ where: { auditId: audit.id } });
    expect(score2?.overall).toBe(score1?.overall);
  });
});
