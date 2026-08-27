import { db } from '@leadguard/database';
import type { PageRecord } from '@leadguard/shared';
import { BoundedCrawler } from '../audit/crawler.js';
import { performHealthCheck } from './healthChecker.js';
import { regressionEngine } from './regressionEngine.js';
import { alertEngine } from './alertEngine.js';
import type { BaselineSnapshot } from './types.js';

export interface MonitoringJobData {
  monitoringConfigId: string;
  triggeredBy?: 'SCHEDULER' | 'MANUAL';
  scheduledSlot?: string;
}

export function computeNextRun(frequency: string, baseDate = new Date()): Date {
  const time = baseDate.getTime();
  switch (frequency) {
    case 'FIVE_MINUTES':
      return new Date(time + 5 * 60 * 1000);
    case 'FIFTEEN_MINUTES':
      return new Date(time + 15 * 60 * 1000);
    case 'HOURLY':
      return new Date(time + 60 * 60 * 1000);
    case 'DAILY':
      return new Date(time + 24 * 60 * 60 * 1000);
    default:
      return new Date(time + 60 * 60 * 1000);
  }
}

export async function processMonitoringJob(
  data: MonitoringJobData,
  signal: AbortSignal
): Promise<{ runId: string; status: string; findingCount: number; pagesEvaluated: number }> {
  const startedAt = Date.now();

  // 1. Fetch monitor config & website
  const config = await db.monitoringConfig.findUniqueOrThrow({
    where: { id: data.monitoringConfigId },
    include: { website: true },
  });

  if ((!config.enabled || config.archivedAt) && data.triggeredBy !== 'MANUAL') {
    return { runId: '', status: 'SKIPPED', findingCount: 0, pagesEvaluated: 0 };
  }

  // 2. Check Run Idempotency (For scheduled slots)
  if (data.scheduledSlot) {
    const existingRun = await db.monitoringRun.findUnique({
      where: {
        monitoringConfigId_scheduledSlot: {
          monitoringConfigId: config.id,
          scheduledSlot: data.scheduledSlot,
        },
      },
    });
    if (existingRun) {
      return {
        runId: existingRun.id,
        status: 'SKIPPED_DUPLICATE',
        findingCount: existingRun.findingsCount,
        pagesEvaluated: existingRun.pagesEvaluated,
      };
    }
  }

  // 3. Create MonitoringRun record
  const run = await db.monitoringRun.create({
    data: {
      monitoringConfigId: config.id,
      websiteId: config.websiteId,
      organizationId: config.organizationId,
      scheduledSlot: data.scheduledSlot || null,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    // 4. Perform Health Check on Root URL
    const health = await performHealthCheck(config.website.url, signal);

    // 5. Multi-Page Crawl if Available
    const pages: PageRecord[] = [];
    if (health.isAvailable) {
      const crawler = new BoundedCrawler({
        maxPages: config.maxPages || 10,
        maxDepth: config.maxDepth || 2,
        concurrencyLimit: 3,
        perRequestTimeoutMs: 8000,
        globalTimeoutMs: 30000,
      });

      const crawlResult = await crawler.crawl(config.website.url, signal);
      pages.push(...Array.from(crawlResult.pages.values()));
    } else {
      // Fallback single failed page
      pages.push({
        url: config.website.url,
        finalUrl: config.website.url,
        statusCode: health.httpStatus || 500,
        html: health.html || '',
        htmlAvailable: Boolean(health.html),
        headers: {},
        depth: 0,
        responseTimeMs: health.responseTimeMs,
        redirectChain: health.redirectChain,
        contentType: health.contentType || 'text/html',
      });
    }

    // 6. Evaluate Baseline & Regressions
    const previousBaseline = config.baseline as unknown as BaselineSnapshot | null;
    const evaluation = await regressionEngine.evaluate(
      config.websiteId,
      pages,
      previousBaseline
    );

    // 7. Track Consecutive Failure State
    let newConsecutiveFailures = config.consecutiveFailures;
    if (!health.isAvailable) {
      newConsecutiveFailures += 1;
    } else {
      newConsecutiveFailures = 0;
    }

    // 8. Persist Findings
    if (evaluation.regressions.length > 0) {
      await db.monitoringFinding.createMany({
        data: evaluation.regressions.map((reg) => ({
          monitoringRunId: run.id,
          monitoringConfigId: config.id,
          websiteId: config.websiteId,
          organizationId: config.organizationId,
          ruleId: reg.ruleId,
          category: reg.category,
          severity: reg.severity,
          changeType: reg.changeType,
          title: reg.title,
          description: reg.description,
          affectedUrl: reg.affectedUrl || null,
          pageTitle: reg.pageTitle || null,
          beforeState: reg.beforeState as object,
          afterState: reg.afterState as object,
          evidence: reg.evidence as object,
        })),
      });
    }

    // 9. Process Alerts (With consecutive failure threshold & performance threshold)
    await alertEngine.processAlerts({
      organizationId: config.organizationId,
      websiteId: config.websiteId,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: evaluation.regressions,
      policy: config.alertPolicy as object,
      isAvailable: health.isAvailable,
      consecutiveFailures: newConsecutiveFailures,
      failureThreshold: config.failureThreshold || 2,
      responseTimeMs: health.responseTimeMs,
      responseTimeThresholdMs: config.responseTimeThresholdMs || 3000,
      tlsValid: health.tlsValid,
      tlsExpiresAt: health.tlsExpiresAt,
      tlsExpiryThresholdDays: config.tlsExpiryThresholdDays || 14,
      error: health.error,
    });

    const durationMs = Date.now() - startedAt;
    const nextRunAt = computeNextRun(config.frequency);

    // 10. Baseline Preservation Policy:
    // Only overwrite baseline if current run was healthy. A transient outage must NOT erase a good baseline!
    const baselineToPersist = health.isAvailable
      ? (evaluation.updatedBaseline as object)
      : (config.baseline as object) || (evaluation.updatedBaseline as object);

    await db.monitoringConfig.update({
      where: { id: config.id },
      data: {
        baseline: baselineToPersist,
        consecutiveFailures: newConsecutiveFailures,
        lastRunAt: new Date(),
        nextRunAt,
        lockedUntil: null,
      },
    });

    // 11. Finalize MonitoringRun
    await db.monitoringRun.update({
      where: { id: run.id },
      data: {
        status: health.isAvailable ? 'COMPLETED' : 'PARTIAL',
        httpStatus: health.httpStatus,
        responseTimeMs: health.responseTimeMs,
        tlsValid: health.tlsValid,
        tlsExpiresAt: health.tlsExpiresAt,
        redirectChain: health.redirectChain,
        scores: evaluation.scores,
        scoreDeltas: evaluation.scoreDeltas,
        pagesEvaluated: pages.length,
        findingsCount: evaluation.regressions.length,
        newRegressionsCount: evaluation.newRegressionsCount,
        resolvedCount: evaluation.resolvedCount,
        errorCode: health.error || null,
        completedAt: new Date(),
        durationMs,
      },
    });

    return {
      runId: run.id,
      status: health.isAvailable ? 'COMPLETED' : 'PARTIAL',
      findingCount: evaluation.regressions.length,
      pagesEvaluated: pages.length,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = err instanceof Error ? err.message : 'Unknown monitoring failure';

    await db.monitoringRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        errorCode: errorMsg,
        completedAt: new Date(),
        durationMs,
      },
    });

    await db.monitoringConfig.update({
      where: { id: config.id },
      data: {
        consecutiveFailures: { increment: 1 },
        lockedUntil: null,
      },
    });

    throw err;
  }
}
