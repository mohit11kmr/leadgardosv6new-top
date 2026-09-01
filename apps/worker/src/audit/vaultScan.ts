import { db } from '@leadguard/database';
import { type VaultFinding } from '@leadguard/shared';
import { BoundedCrawler } from './crawler.js';
import type { CrawlOptions } from './types.js';
import { runVaultGuardScan, upsertVaultFindings } from './vaultRunner.js';
import { createVaultCompletedOutboxEvent, dispatchOutboxEvent, VAULT_COMPLETED_EVENT } from '../webhook/vaultWebhookEmitter.js';

export interface VaultScanResult {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  runId: string;
  pages: number;
  findings: number;
  score: number;
  retestedFindings: number;
  fixedFindings: number;
  verifiedFindings: number;
  riskCounts: Record<string, number>;
}

export async function processVaultScan(
  vaultRunId: string,
  signal: AbortSignal,
  options?: Partial<CrawlOptions>
): Promise<VaultScanResult> {
  const startedAt = Date.now();
  const run = await db.vaultAuditRun.findUniqueOrThrow({
    where: { id: vaultRunId },
    include: { website: true },
  });

  if (run.status !== 'QUEUED' && run.status !== 'RUNNING') {
    return {
      status: 'CANCELLED',
      runId: run.id,
      pages: 0,
      findings: 0,
      score: 0,
      retestedFindings: 0,
      fixedFindings: 0,
      verifiedFindings: 0,
      riskCounts: {},
    };
  }

  // Atomic claim (C8): only transitions a QUEUED/RUNNING run to RUNNING; returns
  // early if another worker already finalised it meanwhile (e.g. stalled-job retry).
  const claimed = await db.vaultAuditRun.updateMany({
    where: {
      id: run.id,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  if (claimed.count === 0) {
    return {
      status: 'CANCELLED',
      runId: run.id,
      pages: 0,
      findings: 0,
      score: 0,
      retestedFindings: 0,
      fixedFindings: 0,
      verifiedFindings: 0,
      riskCounts: {},
    };
  }

  const globalTimeoutMs = options?.globalTimeoutMs ?? Number(process.env.MAX_VAULT_DURATION_MS ?? 120_000);
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => timeoutController.abort(), globalTimeoutMs);
  const combinedSignal = signal.aborted ? signal : timeoutController.signal;

  try {
    const crawler = new BoundedCrawler({
      concurrencyLimit: options?.concurrencyLimit ?? Number(process.env.VAULT_CRAWL_CONCURRENCY ?? 4),
      maxPages: options?.maxPages ?? Number(process.env.VAULT_MAX_PAGES ?? 8),
      maxDepth: options?.maxDepth ?? Number(process.env.VAULT_MAX_DEPTH ?? 2),
      perRequestTimeoutMs: options?.perRequestTimeoutMs ?? 10_000,
      globalTimeoutMs,
      maxResponseBytes: options?.maxResponseBytes ?? 2_000_000,
      countryMode: options?.countryMode ?? 'IN',
    });

    const crawlResult = await crawler.crawl(run.website.normalizedUrl, combinedSignal);
    const pages = Array.from(crawlResult.pages.values());

    if (combinedSignal.aborted) {
      await cancelRun(run.id, startedAt);
      return {
        status: 'CANCELLED',
        runId: run.id,
        pages: pages.length,
        findings: 0,
        score: 0,
        retestedFindings: 0,
        fixedFindings: 0,
        verifiedFindings: 0,
        riskCounts: {},
      };
    }

    if (pages.length === 0) {
      await failRun(run.id, startedAt, crawlResult.lastErrorCode ?? 'NO_PAGES');
      return {
        status: 'FAILED',
        runId: run.id,
        pages: 0,
        findings: 0,
        score: 0,
        retestedFindings: 0,
        fixedFindings: 0,
        verifiedFindings: 0,
        riskCounts: {},
      };
    }

    const scan = await runVaultGuardScan({
      websiteUrl: run.website.normalizedUrl,
      pages,
      context: run.auditId ? { auditId: run.auditId, websiteUrl: run.website.normalizedUrl } : undefined,
    });

    const persisted = await upsertVaultFindings({
      ...(run.auditId ? { auditId: run.auditId } : {}),
      runId: run.id,
      websiteId: run.websiteId,
      findings: scan.findings,
    });

    // LG-040: RETEST loop lifecycle (see classifyRetestTransitions below).
    let fixedFindings = 0;
    let verifiedFindings = 0;
    if (run.mode === 'RETEST') {
      const detected = new Set<string>(
        scan.findings.map((f) => f.normalizedIssueKey ?? f.internalKey ?? f.title)
      );
      const live = await db.vaultAuditFinding.findMany({
        where: {
          websiteId: run.websiteId,
          status: { in: ['OPEN', 'TRIAGED', 'FIXED'] },
        },
        select: { id: true, normalizedIssueKey: true, status: true },
      });
      const { toFixIds, toVerifyIds } = classifyRetestTransitions(live, detected);

      if (toFixIds.length > 0) {
        await db.vaultAuditFinding.updateMany({
          where: { id: { in: toFixIds } },
          data: { status: 'FIXED' },
        });
        fixedFindings = toFixIds.length;
      }
      if (toVerifyIds.length > 0) {
        await db.vaultAuditFinding.updateMany({
          where: { id: { in: toVerifyIds } },
          data: { status: 'VERIFIED' },
        });
        verifiedFindings = toVerifyIds.length;
      }
    }

    const score = computeVaultScore(scan.findings);
    const riskCounts = countRiskBySeverity(scan.findings);
    const currentSnapshot = await snapshotOpenFindings(run.websiteId);
    const summary = {
      score,
      riskCounts,
      openBySeverity: currentSnapshot.bySeverity,
      totalOpen: currentSnapshot.total,
      topFindings: scan.findings
        .sort((a, b) => b.scoreImpact - a.scoreImpact)
        .slice(0, 10)
        .map((f) => ({
          key: f.normalizedIssueKey ?? f.internalKey,
          severity: f.severity,
          affectedUrl: f.affectedUrl,
          title: f.title,
        })),
    };

    const status: 'COMPLETED' | 'PARTIAL' = crawlResult.failedCount > 0 ? 'PARTIAL' : 'COMPLETED';

    // The status update and the outbox-event write happen in a single DB
    // transaction: if the process crashes between them, either both commit
    // or neither does. Previously these were two separate statements, so a
    // crash right after the status update left a COMPLETED run with no
    // outbox row — and thus no webhook, ever, silently — despite the outbox
    // pattern's whole point being guaranteed eventual delivery.
    const { outboxEvent, payload } = await db.$transaction(async (tx) => {
      await tx.vaultAuditRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          pagesDiscovered: crawlResult.discoveredCount,
          pagesFetched: crawlResult.fetchedCount,
          pagesFailed: crawlResult.failedCount,
          findingsCount: persisted,
          score,
          summary,
          retestedFindings: persisted,
          fixedFindings,
          verifiedFindings,
          errorCode: crawlResult.lastErrorCode ?? null,
        },
      });

      const completed = await tx.vaultAuditRun.findUniqueOrThrow({
        where: { id: run.id },
        select: {
          organizationId: true,
          mode: true,
          status: true,
          score: true,
          findingsCount: true,
          retestedFindings: true,
          fixedFindings: true,
          verifiedFindings: true,
          pagesDiscovered: true,
          pagesFetched: true,
          pagesFailed: true,
          durationMs: true,
          completedAt: true,
          summary: true,
        },
      });

      return createVaultCompletedOutboxEvent(tx, {
        organizationId: completed.organizationId,
        runId: run.id,
        websiteId: run.websiteId,
        run: completed,
      });
    });

    // Dispatch (Redis/BullMQ enqueue) happens after the transaction commits —
    // it can't participate in the DB transaction, but that's fine: the outbox
    // row is already durably PENDING, so if this fails, outboxReplay.ts (see
    // apps/worker/src/webhook/outboxReplay.ts) picks it up within
    // OUTBOX_REPLAY_INTERVAL_MS instead of the webhook being lost.
    dispatchOutboxEvent(
      outboxEvent,
      payload as unknown as Record<string, unknown>,
      outboxEvent.organizationId,
      VAULT_COMPLETED_EVENT
    ).catch((err) =>
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'worker',
          event: 'vault_webhook_dispatch_failed',
          runId: run.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      )
    );

    return {
      status,
      runId: run.id,
      pages: pages.length,
      findings: persisted,
      score,
      retestedFindings: persisted,
      fixedFindings,
      verifiedFindings,
      riskCounts,
    };
  } catch (error) {
    clearTimeout(timeoutTimer);
    await failRun(run.id, startedAt, error instanceof Error ? error.message : 'SCAN_ERROR');
    throw error;
  } finally {
    clearTimeout(timeoutTimer);
  }
}

async function cancelRun(runId: string, startedAt: number) {
  await db.vaultAuditRun.update({
    where: { id: runId },
    data: { status: 'CANCELLED', completedAt: new Date(), durationMs: Date.now() - startedAt, errorCode: 'ABORTED' },
  });
}

async function failRun(runId: string, startedAt: number, errorCode: string) {
  await db.vaultAuditRun.update({
    where: { id: runId },
    data: { status: 'FAILED', completedAt: new Date(), durationMs: Date.now() - startedAt, errorCode },
  });
}

/**
 * LG-040 RETEST loop lifecycle, pure and independently testable: a
 * previously live (OPEN/TRIAGED/FIXED) finding that no longer reproduces on
 * this retest is either:
 *  - marked FIXED, if this is the first retest to not see it (was
 *    OPEN/TRIAGED before), or
 *  - promoted to VERIFIED, if it was *already* FIXED and still doesn't
 *    reproduce — i.e. confirmed clean across two independent retests,
 *    matching the HackerOne-style triage lifecycle in
 *    docs/VAULTGUARD_ROADMAP.md §6c.4.
 * Regressions (a FIXED/VERIFIED finding reappearing in a later scan) are
 * handled separately by upsertVaultFindings, which re-opens them to OPEN.
 */
export function classifyRetestTransitions(
  liveFindings: Array<{ id: string; normalizedIssueKey: string; status: string }>,
  detectedIssueKeys: Set<string>
): { toFixIds: string[]; toVerifyIds: string[] } {
  const stale = liveFindings.filter((f) => !detectedIssueKeys.has(f.normalizedIssueKey));
  return {
    toFixIds: stale.filter((f) => f.status !== 'FIXED').map((f) => f.id),
    toVerifyIds: stale.filter((f) => f.status === 'FIXED').map((f) => f.id),
  };
}

export function computeVaultScore(findings: VaultFinding[]): number {
  const byKey = new Map<string, number>();
  for (const f of findings) {
    const key = f.normalizedIssueKey ?? f.internalKey ?? f.title;
    byKey.set(key, Math.max(byKey.get(key) ?? 0, f.scoreImpact));
  }
  const penalty = [...byKey.values()].reduce((sum, v) => sum + v, 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function countRiskBySeverity(findings: VaultFinding[]): Record<string, number> {
  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) {
    const sev = f.severity.toUpperCase();
    if (sev in counts) counts[sev] = (counts[sev] ?? 0) + 1;
  }
  return counts;
}

async function snapshotOpenFindings(
  websiteId: string
): Promise<{ total: number; bySeverity: Record<string, number> }> {
  const grouped = await db.vaultAuditFinding.groupBy({
    by: ['severity'],
    where: { websiteId, status: { in: ['OPEN', 'TRIAGED'] } },
    _count: { _all: true },
  });
  const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const g of grouped) {
    bySeverity[g.severity] = g._count._all;
  }
  const total = Object.values(bySeverity).reduce((s, v) => s + v, 0);
  return { total, bySeverity };
}