import { db } from '@leadguard/database';
import type { PageRecord } from '@leadguard/shared';
import { performHealthCheck } from './healthChecker.js';
import { regressionEngine } from './regressionEngine.js';
import { alertEngine } from './alertEngine.js';
import type { BaselineSnapshot } from './types.js';

export interface MonitoringJobData {
  monitoringConfigId: string;
  triggeredBy?: 'SCHEDULER' | 'MANUAL';
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
): Promise<{ runId: string; status: string; findingCount: number }> {
  const startedAt = Date.now();

  // 1. Fetch monitor config & website
  const config = await db.monitoringConfig.findUniqueOrThrow({
    where: { id: data.monitoringConfigId },
    include: { website: true },
  });

  if (!config.enabled && data.triggeredBy !== 'MANUAL') {
    return { runId: '', status: 'SKIPPED', findingCount: 0 };
  }

  // 2. Create MonitoringRun record
  const run = await db.monitoringRun.create({
    data: {
      monitoringConfigId: config.id,
      websiteId: config.websiteId,
      organizationId: config.organizationId,
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  try {
    // 3. Perform Health Check
    const health = await performHealthCheck(config.website.url, signal);

    // 4. Perform Regression Analysis
    const previousBaseline = config.baseline as unknown as BaselineSnapshot | null;
    const pageRecord: PageRecord = {
      url: config.website.url,
      finalUrl: config.website.url,
      statusCode: health.httpStatus || (health.isAvailable ? 200 : 500),
      html: health.html || '',
      htmlAvailable: Boolean(health.html),
      headers: {},
      depth: 0,
      responseTimeMs: health.responseTimeMs,
      redirectChain: health.redirectChain,
      contentType: health.contentType || 'text/html',
    };

    const evaluation = await regressionEngine.evaluate(
      config.websiteId,
      pageRecord,
      previousBaseline
    );

    // 5. Persist Findings
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
          beforeState: reg.beforeState as object,
          afterState: reg.afterState as object,
          evidence: reg.evidence as object,
        })),
      });
    }

    // 6. Process Alerts
    await alertEngine.processAlerts({
      organizationId: config.organizationId,
      websiteId: config.websiteId,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: evaluation.regressions,
      policy: config.alertPolicy as object,
      isAvailable: health.isAvailable,
      error: health.error,
    });

    const durationMs = Date.now() - startedAt;
    const nextRunAt = computeNextRun(config.frequency);

    // 7. Update Baseline & Schedule in Config
    await db.monitoringConfig.update({
      where: { id: config.id },
      data: {
        baseline: evaluation.updatedBaseline as object,
        lastRunAt: new Date(),
        nextRunAt,
      },
    });

    // 8. Finalize MonitoringRun
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

    throw err;
  }
}
