import { db } from '@leadguard/database';
import { type VaultFinding } from '@leadguard/shared';
import { BoundedCrawler } from './crawler.js';
import type { CrawlOptions } from './types.js';
import { runVaultGuardScan, upsertVaultFindings } from './vaultRunner.js';
import { emitVaultCompleted } from '../webhook/vaultWebhookEmitter.js';

export interface VaultScanResult {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  runId: string;
  pages: number;
  findings: number;
  score: number;
  retestedFindings: number;
  fixedFindings: number;
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
      riskCounts: {},
    };
  }

  await db.vaultAuditRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

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

    let fixedFindings = 0;
    if (run.mode === 'RETEST') {
      const detected = new Set<string>(
        scan.findings.map((f) => f.normalizedIssueKey ?? f.internalKey ?? f.title)
      );
      const live = await db.vaultAuditFinding.findMany({
        where: {
          websiteId: run.websiteId,
          status: { in: ['OPEN', 'TRIAGED'] },
        },
        select: { id: true, normalizedIssueKey: true },
      });
      const stale = live.filter((f) => !detected.has(f.normalizedIssueKey));
      if (stale.length > 0) {
        await db.vaultAuditFinding.updateMany({
          where: { id: { in: stale.map((s) => s.id) } },
          data: { status: 'FIXED' },
        });
        fixedFindings = stale.length;
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

    await db.vaultAuditRun.update({
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
        errorCode: crawlResult.lastErrorCode ?? null,
      },
    });

    // Fire-and-forget: emit security.audit.completed webhook (LG-021/LG-022).
    // Failures must not fail the scan itself; outbox retries handle delivery.
    const completed = await db.vaultAuditRun.findUnique({
      where: { id: run.id },
      select: {
        organizationId: true,
        mode: true,
        status: true,
        score: true,
        findingsCount: true,
        retestedFindings: true,
        fixedFindings: true,
        pagesDiscovered: true,
        pagesFetched: true,
        pagesFailed: true,
        durationMs: true,
        completedAt: true,
        summary: true,
      },
    });
    if (completed) {
      emitVaultCompleted({
        organizationId: completed.organizationId,
        runId: run.id,
        websiteId: run.websiteId,
        run: completed,
      }).catch((err) =>
        console.error(
          JSON.stringify({
            level: 'error',
            service: 'worker',
            event: 'vault_webhook_emit_failed',
            runId: run.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        )
      );
    }

    return {
      status,
      runId: run.id,
      pages: pages.length,
      findings: persisted,
      score,
      retestedFindings: persisted,
      fixedFindings,
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