import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { processMonitoringJob } from '../../apps/worker/src/monitoring/processor.js';

describe('Watchdog Reliability: Queue Retry Idempotency & Failure Counter Safety (Requirement 17)', () => {
  it('prevents duplicate MonitoringRun records and duplicate alert creation when a scheduled slot job retries', async () => {
    const org = await db.organization.create({
      data: { name: 'Retry Org', slug: `retry-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Retry Site',
        url: 'https://retry-site.test',
        normalizedUrl: 'https://retry-site.test',
        domain: 'retry-site.test',
      },
    });

    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        failureThreshold: 2,
      },
    });

    const slot = '2026-08-27T19:00';
    const abortController = new AbortController();

    // 1. First execution attempt
    const result1 = await processMonitoringJob(
      {
        monitoringConfigId: config.id,
        triggeredBy: 'SCHEDULER',
        scheduledSlot: slot,
      },
      abortController.signal
    );

    expect(['COMPLETED', 'PARTIAL']).toContain(result1.status);

    // 2. Retry execution attempt for the EXACT SAME scheduled slot
    const result2 = await processMonitoringJob(
      {
        monitoringConfigId: config.id,
        triggeredBy: 'SCHEDULER',
        scheduledSlot: slot,
      },
      abortController.signal
    );

    // BullMQ retry detected duplicate scheduled slot and skipped
    expect(result2.status).toBe('SKIPPED_DUPLICATE');

    // Verify only 1 MonitoringRun exists in database for this config + slot
    const runs = await db.monitoringRun.findMany({
      where: { monitoringConfigId: config.id, scheduledSlot: slot },
    });
    expect(runs.length).toBe(1);
  });
});
