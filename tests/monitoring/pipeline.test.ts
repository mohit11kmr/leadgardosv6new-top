import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { processMonitoringJob } from '../../apps/worker/src/monitoring/processor.js';

describe('Watchdog Monitoring: Execution Pipeline (Requirement 3, 10, 40)', () => {
  it('executes health check and regression scans, updating baseline and scheduling next run', async () => {
    const org = await db.organization.create({
      data: { name: 'Pipeline Org', slug: `pipe-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Pipeline Site',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        domain: 'example.com',
      },
    });
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
      },
    });

    const controller = new AbortController();
    const result = await processMonitoringJob(
      { monitoringConfigId: config.id, triggeredBy: 'MANUAL' },
      controller.signal
    );

    expect(result.runId).toBeDefined();
    expect(['COMPLETED', 'PARTIAL']).toContain(result.status);

    // Verify MonitoringRun persisted
    const run = await db.monitoringRun.findUnique({ where: { id: result.runId } });
    expect(run).not.toBeNull();
    expect(run?.status).toBe(result.status);
    expect(run?.scores).toBeDefined();

    // Verify baseline and next run scheduled
    const updatedConfig = await db.monitoringConfig.findUnique({ where: { id: config.id } });
    expect(updatedConfig?.baseline).not.toBeNull();
    expect(updatedConfig?.lastRunAt).not.toBeNull();
    expect(updatedConfig?.nextRunAt).not.toBeNull();
  });
});
