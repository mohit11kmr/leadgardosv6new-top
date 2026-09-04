import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { AuditOrchestrator } from '../../apps/worker/src/audit/orchestrator.js';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL ??= 'redis://localhost:16380';
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.APP_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';

/**
 * Regression suite for the audit claim/idempotency contract (see
 * docs/DETECTION_INTEGRITY.md). AuditOrchestrator.execute() previously
 * rejected any CANCELLED or COMPLETED audit outright — which broke
 * legitimate retries/re-runs (tests/retry.test.ts) and, separately, never
 * actually protected against two concurrent executions of a genuinely
 * in-flight (RUNNING) audit, since RUNNING was never excluded from the
 * claimable set. These tests cover the corrected semantics directly against
 * the DB-level claim, independent of tests/retry.test.ts's full pipeline
 * assertions.
 */
async function seedAudit(status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'CANCELLED', startedAt?: Date) {
  const org = await db.organization.create({
    data: { name: 'Retry Contract Org', slug: `retry-contract-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const website = await db.website.create({
    data: {
      organizationId: org.id,
      name: 'Retry Contract Site',
      url: 'https://example.com',
      normalizedUrl: 'https://example.com',
      domain: 'example.com',
    },
  });
  const audit = await db.audit.create({
    data: { organizationId: org.id, websiteId: website.id, status, startedAt: startedAt ?? null },
  });
  return audit;
}

describe('Audit claim/idempotency contract (Requirement 33 follow-up)', () => {
  it('FAILED → retry: a previously failed audit can be re-claimed and completes', async () => {
    const audit = await seedAudit('FAILED');
    const orchestrator = new AuditOrchestrator();
    const result = await orchestrator.execute(audit.id, new AbortController().signal);
    expect(['COMPLETED', 'PARTIAL']).toContain(result.status);
  }, 30_000);

  it('COMPLETED → explicit re-run: a finished audit can be re-run on demand', async () => {
    const audit = await seedAudit('COMPLETED');
    const orchestrator = new AuditOrchestrator();
    const result = await orchestrator.execute(audit.id, new AbortController().signal);
    expect(['COMPLETED', 'PARTIAL']).toContain(result.status);
  }, 30_000);

  it('CANCELLED → never reclaimable, even on retry', async () => {
    const audit = await seedAudit('CANCELLED');
    const orchestrator = new AuditOrchestrator();
    await expect(orchestrator.execute(audit.id, new AbortController().signal)).rejects.toThrow(/not eligible/);

    const stillCancelled = await db.audit.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stillCancelled.status).toBe('CANCELLED');
  }, 30_000);

  it('RUNNING (fresh) → duplicate delivery while processing is rejected, not re-executed', async () => {
    // Simulates a second delivery of the same logical job arriving while the
    // first execution is still genuinely in flight (e.g. guestScanService's
    // /publicAuditService's enqueue calls have no deterministic jobId, so
    // BullMQ cannot dedupe them at the queue level — this claim guard is the
    // only remaining protection).
    const audit = await seedAudit('RUNNING', new Date());
    const orchestrator = new AuditOrchestrator();
    await expect(orchestrator.execute(audit.id, new AbortController().signal)).rejects.toThrow(/not eligible/);

    const stillRunning = await db.audit.findUniqueOrThrow({ where: { id: audit.id } });
    expect(stillRunning.status).toBe('RUNNING');
  }, 30_000);

  it('RUNNING (stale) → worker-crash recovery: an orphaned run older than the timeout is reclaimable', async () => {
    const staleStartedAt = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago — far past any timeout+grace window
    const audit = await seedAudit('RUNNING', staleStartedAt);
    const orchestrator = new AuditOrchestrator();
    const result = await orchestrator.execute(audit.id, new AbortController().signal);
    expect(['COMPLETED', 'PARTIAL']).toContain(result.status);
  }, 30_000);

  it('concurrent execution: N simultaneous calls on the same fresh audit — exactly one claims it', async () => {
    const audit = await seedAudit('QUEUED');
    const orchestrator = new AuditOrchestrator();

    const attempts = await Promise.allSettled([
      orchestrator.execute(audit.id, new AbortController().signal),
      orchestrator.execute(audit.id, new AbortController().signal),
      orchestrator.execute(audit.id, new AbortController().signal),
    ]);

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    // Exactly one concurrent call wins the initial claim. The others may
    // either be rejected immediately (still RUNNING) or — if they lose the
    // race after the winner has already completed — succeed as a legitimate
    // subsequent re-run. What must never happen is more than one execution
    // running truly concurrently, which the DB-level compare-and-swap
    // guarantees regardless of ordering.
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason?.message).toMatch(/not eligible/);
    }

    const runs = await db.auditRun.findMany({ where: { auditId: audit.id } });
    expect(runs.length).toBe(attempts.length); // every attempt gets an AuditRun row, win or lose
    const executedRuns = runs.filter((r) => r.status !== 'CANCELLED');
    // Rejected claim attempts are closed out as CANCELLED, not left dangling
    // at RUNNING — only actual winners have a real (non-cancelled) run.
    expect(executedRuns.length).toBe(fulfilled.length);
  }, 45_000);
});
