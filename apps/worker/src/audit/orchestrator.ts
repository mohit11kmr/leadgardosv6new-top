import { db } from '@leadguard/database';
import { config } from '@leadguard/config';
import {
  buildBusinessImpact,
  buildExecutiveSummary,
  calculateScores,
  evaluateTrackingRuntime,
  scannerRegistry,
  type Finding,
  type PageRecord,
  type TrackingRuntimeEvaluation,
} from '@leadguard/shared';
import {
  aggregateWebsiteSignals,
  deduplicateFindings,
  evaluateWebsiteLevelScanners,
  mergeRenderedSignals,
} from './aggregation.js';
import { BoundedCrawler } from './crawler.js';
import {
  evaluateConsentFindings,
  evaluateDuplicateContentFindings,
  evaluateHreflangReciprocity,
} from './detectionIntelligenceP1.js';
import { finalizeAudit } from './finalizer.js';
import { fetchPage } from './fetcher.js';
import { recordFailedPage, upsertAuditPage } from './persistence.js';
import { fetchRenderedHtml, type RenderedPageResult } from './renderedFetch.js';
import { fetchRobotsAndSitemap, isPathDisallowed } from './robotsSitemap.js';
import { sendGuestScanReadyEmail } from './guestScanNotifier.js';
import { AuditTelemetryTracker } from './telemetry.js';
import type { AuditExecutionResult, CrawlOptions } from './types.js';

// Grace buffer added on top of the per-run global timeout before a RUNNING
// audit is considered orphaned (worker crashed mid-run, never reached
// finalizeAudit) rather than genuinely still in flight. Must exceed the
// timeout so a run that legitimately hits its own deadline and is finalizing
// is never reclaimed out from under itself.
const STALE_RUNNING_GRACE_MS = 30_000;

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

    const globalTimeoutMs = options?.globalTimeoutMs ?? Number(process.env.MAX_AUDIT_DURATION_MS ?? 60_000);

    // 3. Claim the audit atomically. This distinguishes three cases per the
    // audit idempotency contract (see docs/DETECTION_INTEGRITY.md):
    //   - CANCELLED is permanently terminal — never reclaimable.
    //   - RUNNING is reclaimable only once stale (startedAt older than the
    //     global audit timeout + a grace buffer), i.e. a worker crashed
    //     mid-run and never reached finalizeAudit. A genuinely fresh RUNNING
    //     audit is NOT reclaimable — this is what actually blocks concurrent
    //     duplicate execution. (The previous guard only excluded
    //     CANCELLED/COMPLETED, so two concurrent deliveries of the same
    //     un-deduped job — see guestScanService.ts/publicAuditService.ts,
    //     which enqueue without a deterministic jobId — could both claim a
    //     RUNNING audit and execute concurrently, corrupting shared state.)
    //   - QUEUED, FAILED, PARTIAL, and COMPLETED are all reclaimable:
    //     retrying a failed run and explicitly re-running a completed audit
    //     are both legitimate (see tests/retry.test.ts) — the previous guard
    //     incorrectly rejected re-running a COMPLETED audit at all.
    const staleRunningBefore = new Date(Date.now() - globalTimeoutMs - STALE_RUNNING_GRACE_MS);
    const claimed = await db.audit.updateMany({
      where: {
        id: auditId,
        status: { not: 'CANCELLED' },
        OR: [{ status: { not: 'RUNNING' } }, { startedAt: { lt: staleRunningBefore } }],
      },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        progressStage: 'discovery',
        progress: 5,
      },
    });

    if (claimed.count === 0) {
      const reason = audit.status === 'CANCELLED' ? 'cancelled' : 'already_running';
      console.log(
        JSON.stringify({ level: 'info', service: 'worker', event: 'audit_claim_rejected', auditId, reason })
      );
      // This attempt's own AuditRun row (created above) never actually ran —
      // close it out rather than leaving it stuck at RUNNING forever, so a
      // rejected duplicate-delivery attempt doesn't masquerade as an
      // in-progress execution in AuditRun history.
      await db.auditRun.update({
        where: { id: run.id },
        data: { status: 'CANCELLED', errorCode: `CLAIM_REJECTED_${reason.toUpperCase()}`, completedAt: new Date() },
      });
      throw new Error(`Audit cannot be started: current status is not eligible (status=${audit.status})`);
    }

    console.log(
      JSON.stringify({ level: 'info', service: 'worker', event: 'audit_claim_accepted', auditId, runId: run.id })
    );

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

    // 3b. robots.txt + sitemap.xml discovery — best-effort, non-fatal (most
    // sites have neither, or one without the other). Feeds two things into
    // the crawl: (1) robots.txt Disallow rules, honored via isUrlAllowed
    // below so the crawler never fetches an explicitly-excluded path, and
    // (2) sitemap-declared URLs, used after the main link-crawl to pick up
    // pages a pure link-follow crawl wouldn't reach on its own (orphaned
    // pages with no internal inbound link).
    const origin = new URL(audit.website.normalizedUrl).origin;
    const robotsSitemap = await fetchRobotsAndSitemap(origin, combinedSignal).catch(() => ({
      disallowedPaths: [] as string[],
      sitemapUrls: [] as string[],
      robotsFetched: false,
      sitemapFetched: false,
    }));
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'worker',
        event: 'robots_sitemap_discovery_completed',
        auditId,
        robotsFetched: robotsSitemap.robotsFetched,
        sitemapFetched: robotsSitemap.sitemapFetched,
        disallowedRuleCount: robotsSitemap.disallowedPaths.length,
        sitemapUrlCount: robotsSitemap.sitemapUrls.length,
      })
    );

    const crawler = new BoundedCrawler({
      concurrencyLimit,
      maxPages,
      maxDepth,
      perRequestTimeoutMs: options?.perRequestTimeoutMs ?? 10_000,
      globalTimeoutMs,
      maxResponseBytes: options?.maxResponseBytes ?? 2_000_000,
      countryMode: options?.countryMode ?? 'IN',
      isUrlAllowed:
        robotsSitemap.disallowedPaths.length > 0
          ? (url: string) => {
              try {
                return !isPathDisallowed(new URL(url).pathname, robotsSitemap.disallowedPaths);
              } catch {
                return true;
              }
            }
          : undefined,
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

    // 3c. Supplement with sitemap-only pages: pages the sitemap declares
    // that the link-following crawl never reached (no internal inbound
    // link pointed at them). Bounded conservatively (5 pages, remaining
    // page budget, remaining time budget) — this is a small enhancement on
    // top of an already-working crawl, not a second full crawl pass.
    if (!signal.aborted && robotsSitemap.sitemapUrls.length > 0 && pages.length < maxPages) {
      const alreadyCrawled = new Set(pages.map((p) => p.finalUrl || p.url));
      const remainingBudget = Math.min(5, maxPages - pages.length);
      const candidates = robotsSitemap.sitemapUrls
        .filter((u) => {
          try {
            return new URL(u).origin === origin && !alreadyCrawled.has(u) && !isPathDisallowed(new URL(u).pathname, robotsSitemap.disallowedPaths);
          } catch {
            return false;
          }
        })
        .slice(0, remainingBudget);

      for (const sitemapUrl of candidates) {
        try {
          const supplementController = new AbortController();
          const supplementTimer = setTimeout(() => supplementController.abort(), 8_000);
          const page = await fetchPage(sitemapUrl, supplementController.signal, 0, undefined, 2_000_000);
          clearTimeout(supplementTimer);
          if (!alreadyCrawled.has(page.finalUrl)) {
            pages.push(page);
            alreadyCrawled.add(page.finalUrl);
            await upsertAuditPage(auditId, page);
          }
        } catch {
          // Best-effort — a sitemap entry that 404s or times out is simply skipped.
        }
      }

      if (candidates.length > 0) {
        console.log(
          JSON.stringify({
            level: 'info',
            service: 'worker',
            event: 'sitemap_supplement_completed',
            auditId,
            attempted: candidates.length,
            pagesAfterSupplement: pages.length,
          })
        );
      }
    }

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
    let signals = aggregateWebsiteSignals(pages);

    // 5b. Optional headless-browser rescan of the homepage: catches
    // tracking/CTA signals only present after client-side JS execution
    // (SPA sites), merged in a way that can only remove false positives,
    // never suppress a real static-HTML finding (see mergeRenderedSignals).
    // The same browser pass also captures outbound network requests during
    // the visit, letting the tracking scanner distinguish "tag code present"
    // from "tag actually fired a request" (see network-evidence.ts /
    // docs/DETECTION_INTEGRITY.md) — this reuses the one existing Playwright
    // launch rather than adding a second browser pass.
    let trackingRuntime: TrackingRuntimeEvaluation | undefined;
    if (config.ENABLE_JS_RENDERED_RESCAN && pages.length > 0) {
      const homepage = pages.find((p) => p.depth === 0) ?? pages[0]!;
      const rendered = await fetchRenderedHtml(homepage.finalUrl || homepage.url, combinedSignal).catch(
        (): RenderedPageResult => ({ html: null, networkEvidence: [], captureAttempted: false })
      );
      if (rendered.html) {
        const renderedSignals = aggregateWebsiteSignals([{ ...homepage, html: rendered.html }]);
        signals = mergeRenderedSignals(signals, renderedSignals);
      }
      trackingRuntime = evaluateTrackingRuntime(rendered.networkEvidence, rendered.captureAttempted);
      console.log(
        JSON.stringify({
          level: 'info',
          service: 'worker',
          event: 'network_capture_completed',
          auditId,
          captureAttempted: rendered.captureAttempted,
          trackingEventsObserved: rendered.networkEvidence.length,
          providerMatches: {
            ga4: trackingRuntime.ga4.runtimeStatus,
            gtm: trackingRuntime.gtm.runtimeStatus,
            metaPixel: trackingRuntime.metaPixel.runtimeStatus,
          },
        })
      );
    }

    const siteFindings = await evaluateWebsiteLevelScanners(
      audit.website.normalizedUrl,
      signals,
      pages,
      {
        auditId,
        websiteUrl: audit.website.normalizedUrl,
        countryMode: options?.countryMode ?? 'IN',
      },
      trackingRuntime
    );
    allFindings.push(...siteFindings);

    // 5b. Detection Intelligence P1: consent/CMP + consent-tracking
    // correlation, cross-page hreflang reciprocity, duplicate-content —
    // all website-scope, all reusing the pages/trackingRuntime already
    // computed above (no extra crawl or browser pass).
    allFindings.push(...evaluateConsentFindings(pages, signals, trackingRuntime, audit.website.normalizedUrl));
    allFindings.push(...evaluateHreflangReciprocity(pages, audit.website.normalizedUrl));
    allFindings.push(...evaluateDuplicateContentFindings(pages, audit.website.normalizedUrl));

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

    // Guest-flow "your scan is ready" email — only ever fires when the
    // public/free-scan submission captured an email (guestEmail is never
    // set for authenticated org audits). Fire-and-forget: a delivery
    // failure must never fail the audit itself.
    if ((status === 'COMPLETED' || status === 'PARTIAL') && audit.guestEmail) {
      sendGuestScanReadyEmail({
        email: audit.guestEmail,
        auditId,
        domain: audit.website.domain,
        overallScore: scores.overall,
        totalFindings: findings.length,
      }).catch((err) =>
        console.error(
          JSON.stringify({
            level: 'error',
            service: 'worker',
            event: 'guest_scan_email_failed',
            auditId,
            error: err instanceof Error ? err.message : 'Unknown error',
          })
        )
      );
    }

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
