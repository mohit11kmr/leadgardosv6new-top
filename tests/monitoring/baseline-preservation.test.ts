import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { alertEngine } from '../../apps/worker/src/monitoring/alertEngine.js';

describe('Watchdog Reliability: Baseline Preservation & Consecutive Failure Threshold (Requirement 11, 12, 29)', () => {
  it('does not create outage alert on single transient failure, but creates alert when failureThreshold reached', async () => {
    const org = await db.organization.create({
      data: { name: 'Transient Org', slug: `trans-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Transient Site',
        url: 'https://transient.test',
        normalizedUrl: 'https://transient.test',
        domain: 'transient.test',
      },
    });

    const initialBaseline = {
      websiteId: website.id,
      capturedAt: new Date().toISOString(),
      scores: { lead: 90, advertising: 90, seo: 90, security: 90, overall: 90 },
      pages: [],
      findingKeys: [],
      signals: {},
    };

    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        failureThreshold: 2,
        baseline: initialBaseline,
      },
    });

    const run = await db.monitoringRun.create({
      data: {
        monitoringConfigId: config.id,
        websiteId: website.id,
        organizationId: org.id,
        status: 'FAILED',
      },
    });

    // 1. Single Transient Failure (consecutiveFailures = 1, threshold = 2) -> NO alert created
    const alerts1 = await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: [],
      isAvailable: false,
      consecutiveFailures: 1,
      failureThreshold: 2,
      responseTimeMs: 0,
      responseTimeThresholdMs: 3000,
      tlsValid: false,
      tlsExpiresAt: null,
      tlsExpiryThresholdDays: 14,
      error: 'TIMEOUT',
    });

    expect(alerts1.length).toBe(0);

    // 2. Second Consecutive Failure (consecutiveFailures = 2, threshold = 2) -> ALERT created
    const alerts2 = await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: config.id,
      monitoringRunId: run.id,
      regressions: [],
      isAvailable: false,
      consecutiveFailures: 2,
      failureThreshold: 2,
      responseTimeMs: 0,
      responseTimeThresholdMs: 3000,
      tlsValid: false,
      tlsExpiresAt: null,
      tlsExpiryThresholdDays: 14,
      error: 'TIMEOUT',
    });

    expect(alerts2.length).toBe(1);
    expect(alerts2[0]?.status).toBe('OPEN');
    expect(alerts2[0]?.ruleId).toBe('AVAILABILITY_OUTAGE');
  });
});
