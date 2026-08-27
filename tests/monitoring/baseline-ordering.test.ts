import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { processMonitoringJob } from '../../apps/worker/src/monitoring/processor.js';
import type { BaselineSnapshot } from '../../apps/worker/src/monitoring/types.js';

describe('Watchdog Reliability: Out-of-Order Execution & Baseline Version Monotonicity (Requirement 13, 19)', () => {
  it('prevents an older execution (Run A) from overwriting a newer baseline (Run B) when B completes first', async () => {
    const org = await db.organization.create({
      data: { name: 'Baseline Order Org', slug: `base-ord-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Site Baseline Order',
        url: 'https://site-base-ord.test',
        normalizedUrl: 'https://site-base-ord.test',
        domain: 'site-base-ord.test',
      },
    });

    const baselineInitial: BaselineSnapshot = {
      websiteId: website.id,
      capturedAt: new Date(Date.now() - 3600000).toISOString(),
      scores: { lead: 70, advertising: 70, seo: 70, security: 70, overall: 70 },
      pages: [],
      findingKeys: [],
      signals: {},
    };

    // Initial config at baselineVersion = 1
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        baseline: baselineInitial as object,
        baselineVersion: 1,
      },
    });

    // Run B finishes first and advances baselineVersion to 2 with newer scores
    const baselineB: BaselineSnapshot = {
      websiteId: website.id,
      capturedAt: new Date().toISOString(),
      scores: { lead: 95, advertising: 95, seo: 95, security: 95, overall: 95 },
      pages: [],
      findingKeys: [],
      signals: {},
    };

    await db.monitoringConfig.update({
      where: { id: config.id },
      data: {
        baseline: baselineB as object,
        baselineVersion: 2,
      },
    });

    // Run A (which started when baselineVersion was 1) completes now with older expectedBaselineVersion = 1
    // Using an abort signal that won't abort
    const abortController = new AbortController();

    await processMonitoringJob(
      {
        monitoringConfigId: config.id,
        triggeredBy: 'MANUAL',
        expectedBaselineVersion: 1, // Stale expected version!
      },
      abortController.signal
    );

    // Verify config: baselineVersion remains 2 (or higher), and baseline is NOT overwritten by Run A!
    const updatedConfig = await db.monitoringConfig.findUniqueOrThrow({
      where: { id: config.id },
    });

    const persistedBaseline = updatedConfig.baseline as unknown as BaselineSnapshot;
    expect(persistedBaseline.scores.overall).toBe(95); // Preserved Run B's newer baseline!
  });
});
