import { db } from '@leadguard/database';
import {
  buildBusinessImpact,
  buildExecutiveSummary,
  calculateScores,
  scannerRegistry,
  type Finding,
  type PageRecord,
} from '@leadguard/shared';
import {
  aggregateWebsiteSignals,
  deduplicateFindings,
  evaluateWebsiteLevelScanners,
} from './aggregation.js';
import { BoundedCrawler } from './crawler.js';
import { finalizeAudit } from './finalizer.js';
import { recordFailedPage, upsertAuditPage } from './persistence.js';
import { AuditTelemetryTracker } from './telemetry.js';
import type { AuditExecutionResult, CrawlOptions } from './types.js';

export class AuditOrchestrator {
  async execute(auditId: string, signal: AbortSignal, options?: Partial<CrawlOptions>): Promise<AuditExecutionResult> {
    const startedAt = Date.now();
    const telemetry = new AuditTelemetryTracker();

    // 1. Fetch audit & website record
    const audit = await db.audit.findUniqueOrThrow({
      where: { id: auditId },
      include: { website: true },
    });

    // 2. Create AuditRun record tracking this execution run
    const run = await db.auditRun.create({
      data: {
        auditId,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    await db.audit.update({
      where: { id: auditId },
      data: {
        status: 'RUNNING',
        startedAt: audit.startedAt ?? new Date(),
        progressStage: 'discovery',
        progress: 5,
      },
    });

    const globalTimeoutMs = options?.globalTimeoutMs ?? Number(process.env.MAX_AUDIT_DURATION_MS ?? 60_000);
    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), globalTimeoutMs);

    let isTimedOut = false;
    const combinedSignal = signal.aborted
      ? signal
      : timeoutController.signal;

    // 3. Initialize BoundedCrawler
    const concurrencyLimit = options?.concurrencyLimit ?? Number(process.env.CRAWL_CONCURRENCY ?? 4);
    const maxPages = options?.maxPages ?? Number(process.env.MAX_PAGES_PER_AUDIT ?? 10);
    const maxDepth = options?.maxDepth ?? Number(process.env.MAX_CRAWL_DEPTH ?? 2);

    const crawler = new BoundedCrawler({
      concurrencyLimit,
      maxPages,
      maxDepth,
      perRequestTimeoutMs: options?.perRequestTimeoutMs ?? 10_000,
      globalTimeoutMs,
      maxResponseBytes: options?.maxResponseBytes ?? 2_000_000,
      countryMode: options?.countryMode ?? 'IN',
    });

    telemetry.startStage('crawl');

    const crawlResult = await crawler.crawl(
      audit.website.normalizedUrl,
      combinedSignal,
      async (page, queueState) => {
        // Persist page record to DB
        await upsertAuditPage(auditId, page);

        // Update progress in DB periodically
        await db.audit.update({
          where: { id: auditId },
          data: {
            progressStage: 'fetching',
            progress: Math.min(75, 10 + queueState.fetched * 6),
            pagesDiscovered: queueState.discovered,
            pagesFetched: queueState.fetched,
          },
        });
      },
      async (url, depth, parentUrl, errorCode) => {
        await recordFailedPage(auditId, url, depth, parentUrl, errorCode);
      }
    );

    clearTimeout(timeoutTimer);
    telemetry.endStage('crawl', 'crawlDurationMs');

    if (signal.aborted) {
      await db.auditRun.update({
        where: { id: run.id },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          durationMs: Date.now() - startedAt,
          errorCode: 'ABORTED',
        },
      });
      return { status: 'CANCELLED', runId: run.id, pages: crawlResult.fetchedCount, findings: 0 };
    }

    if (timeoutController.signal.aborted && !signal.aborted) {
      isTimedOut = true;
    }

    const pages = Array.from(crawlResult.pages.values());

    await db.audit.update({
      where: { id: auditId },
      data: {
        progressStage: 'scanning',
        progress: 80,
        pagesScanned: pages.length,
      },
    });

    // 4. Run Page-level scanners driven by scanner registry
    telemetry.startStage('scan');
    const allFindings: Finding[] = [];

    for (const page of pages) {
      const { findings: pageFindings } = await scannerRegistry.runPageScanners(page, {
        auditId,
        websiteUrl: audit.website.normalizedUrl,
        countryMode: options?.countryMode ?? 'IN',
      });
      allFindings.push(...pageFindings);
    }
    telemetry.endStage('scan', 'scanDurationMs');

    // 5. Aggregate website signals and evaluate site-level scanners
    telemetry.startStage('aggregation');
    const signals = aggregateWebsiteSignals(pages);
    const siteFindings = await evaluateWebsiteLevelScanners(
      audit.website.normalizedUrl,
      signals,
      pages,
      {
        auditId,
        websiteUrl: audit.website.normalizedUrl,
        countryMode: options?.countryMode ?? 'IN',
      }
    );
    allFindings.push(...siteFindings);

    // 6. Deduplicate findings across scopes
    const findings = deduplicateFindings(allFindings);
    telemetry.endStage('aggregation', 'aggregationDurationMs');

    // 7. Calculate scores (Scoring V3)
    telemetry.startStage('score');
    const scores = calculateScores(findings, audit.scoringVersion || 'v3');
    telemetry.endStage('score', 'scoreDurationMs');

    // 8. Business Impact (Potential Opportunity Loss)
    const impact = buildBusinessImpact(findings, {
      monthlyVisitors: Number(process.env.DEFAULT_MONTHLY_VISITORS ?? 0),
      conversionRate: Number(process.env.DEFAULT_CONVERSION_RATE ?? 0),
      averageLeadValue: Number(process.env.DEFAULT_AVERAGE_LEAD_VALUE ?? 0),
    });

    // 9. Executive Summary
    const summary = buildExecutiveSummary(findings, scores, impact);

    // 10. Status determination
    let status: 'COMPLETED' | 'PARTIAL' | 'FAILED' = 'COMPLETED';
    if (pages.length === 0) {
      status = 'FAILED';
    } else if (crawlResult.failedCount > 0 || isTimedOut) {
      status = 'PARTIAL';
    }

    telemetry.recordCounts({
      pagesDiscovered: crawlResult.discoveredCount,
      pagesFetched: crawlResult.fetchedCount,
      pagesFailed: crawlResult.failedCount,
      findingsGenerated: findings.length,
    });
    telemetry.setMetric('totalDurationMs', Date.now() - startedAt);

    // 11. Finalization
    telemetry.startStage('finalization');
    await finalizeAudit({
      auditId,
      runId: run.id,
      status,
      pages,
      findings,
      scores,
      impact,
      summary,
      telemetry: telemetry.getTelemetry(),
      errorCode: isTimedOut ? 'TIMEOUT' : crawlResult.lastErrorCode,
      startedAt,
    });
    telemetry.endStage('finalization', 'finalizationDurationMs');

    console.log(
      JSON.stringify({
        level: 'info',
        service: 'worker',
        auditId,
        runId: run.id,
        organizationId: audit.organizationId,
        websiteId: audit.websiteId,
        stage: status === 'COMPLETED' ? 'completed' : status.toLowerCase(),
        duration: Date.now() - startedAt,
        pages: pages.length,
        findings: findings.length,
        status,
      })
    );

    return {
      status,
      runId: run.id,
      pages: pages.length,
      findings: findings.length,
      scores,
      impact,
      summary,
      telemetry: telemetry.getTelemetry(),
    };
  }
}
