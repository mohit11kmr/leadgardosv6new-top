import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { alertEngine } from '../../apps/worker/src/monitoring/alertEngine.js';

describe('Watchdog Monitoring: Alert Deduplication & Lifecycle (Requirement 19, 20, 21)', () => {
  it('deduplicates alerts by fingerprint and resolves alerts when issues are fixed', async () => {
    const org = await db.organization.create({
      data: { name: 'Alert Org', slug: `alert-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Alert Site',
        url: 'https://alert.test',
        normalizedUrl: 'https://alert.test',
        domain: 'alert.test',
      },
    });
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
      },
    });
    const run = await db.monitoringRun.create({
      data: {
        monitoringConfigId: config.id,
        websiteId: website.id,
        organizationId: org.id,
        status: 'COMPLETED',
      },
    });

    // 1. Initial Outage -> Creates OPEN alert
    const alerts1 = await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: [],
      isAvailable: false,
      error: 'HTTP_500',
    });

    expect(alerts1.length).toBe(1);
    expect(alerts1[0]?.status).toBe('OPEN');
    expect(alerts1[0]?.ruleId).toBe('AVAILABILITY_OUTAGE');

    // 2. Duplicate Run with Same Outage -> Deduplicated, no new alert created
    const alerts2 = await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: [],
      isAvailable: false,
      error: 'HTTP_500',
    });

    expect(alerts2.length).toBe(0);

    // 3. Subsequent Run with Healthy State -> Auto-resolves OPEN alert
    await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: [],
      isAvailable: true,
    });

    const activeAlerts = await db.monitoringAlert.findMany({
      where: { monitoringConfigId: config.id, status: 'OPEN' },
    });
    expect(activeAlerts.length).toBe(0);

    const resolvedAlerts = await db.monitoringAlert.findMany({
      where: { monitoringConfigId: config.id, status: 'RESOLVED' },
    });
    expect(resolvedAlerts.length).toBe(1);
  });
});
