import { describe, it, expect, vi, afterEach } from 'vitest';
import { db } from '@leadguard/database';
import { alertEngine } from '../../apps/worker/src/monitoring/alertEngine.js';
import { emailProvider } from '../../apps/worker/src/monitoring/notifications/emailProvider.js';

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
        failureThreshold: 2,
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

    // 1. Outage with consecutiveFailures >= 2 -> Creates OPEN alert
    const alerts1 = await alertEngine.processAlerts({
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
      consecutiveFailures: 3,
      failureThreshold: 2,
      responseTimeMs: 0,
      responseTimeThresholdMs: 3000,
      tlsValid: false,
      tlsExpiresAt: null,
      tlsExpiryThresholdDays: 14,
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
      consecutiveFailures: 0,
      failureThreshold: 2,
      responseTimeMs: 150,
      responseTimeThresholdMs: 3000,
      tlsValid: true,
      tlsExpiresAt: null,
      tlsExpiryThresholdDays: 14,
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

// Regression: AlertPolicy.notifyEmail was defined on the type but nothing
// ever read it — no monitoring alert has ever triggered an email, regardless
// of NotificationPreference rows. This proves a newly-created alert actually
// reaches emailProvider.sendEmail for subscribed recipients.
describe('Watchdog Monitoring: alert email notifications', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails every user with an enabled MONITORING_ALERT email preference when a new alert is created', async () => {
    const org = await db.organization.create({
      data: { name: 'Alert Email Org', slug: `alert-email-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Alert Email Site',
        url: 'https://alert-email.test',
        normalizedUrl: 'https://alert-email.test',
        domain: 'alert-email.test',
      },
    });
    const monitoringConfig = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: website.id, frequency: 'HOURLY', failureThreshold: 1 },
    });
    const run = await db.monitoringRun.create({
      data: { monitoringConfigId: monitoringConfig.id, websiteId: website.id, organizationId: org.id, status: 'COMPLETED' },
    });
    const user = await db.user.create({
      data: { email: `alert-recipient-${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    await db.notificationPreference.create({
      data: { userId: user.id, organizationId: org.id, channel: 'EMAIL', enabled: true },
    });

    const sendEmailSpy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue({ messageId: 'test', success: true });

    await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: monitoringConfig.id,
      monitoringRunId: run.id,
      regressions: [],
      isAvailable: false,
      consecutiveFailures: 1,
      failureThreshold: 1,
      responseTimeMs: 0,
      responseTimeThresholdMs: 3000,
      tlsValid: false,
      tlsExpiresAt: null,
      tlsExpiryThresholdDays: 14,
      error: 'HTTP_500',
    });

    // notifyRecipients runs fire-and-forget; give its microtasks a tick.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendEmailSpy.mock.calls[0]?.[0].to).toBe(user.email);
    expect(sendEmailSpy.mock.calls[0]?.[0].subject).toContain('alert-email.test');
  });

  it('does not email when policy.notifyEmail is explicitly false', async () => {
    const org = await db.organization.create({
      data: { name: 'Alert Email Opt-Out Org', slug: `alert-email-optout-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Alert Opt Out Site',
        url: 'https://alert-optout.test',
        normalizedUrl: 'https://alert-optout.test',
        domain: 'alert-optout.test',
      },
    });
    const monitoringConfig = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: website.id, frequency: 'HOURLY', failureThreshold: 1 },
    });
    const run = await db.monitoringRun.create({
      data: { monitoringConfigId: monitoringConfig.id, websiteId: website.id, organizationId: org.id, status: 'COMPLETED' },
    });
    const user = await db.user.create({
      data: { email: `alert-optout-${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    await db.notificationPreference.create({
      data: { userId: user.id, organizationId: org.id, channel: 'EMAIL', enabled: true },
    });

    const sendEmailSpy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue({ messageId: 'test', success: true });

    await alertEngine.processAlerts({
      organizationId: org.id,
      websiteId: website.id,
      monitoringConfigId: monitoringConfig.id,
      monitoringRunId: run.id,
      regressions: [],
      policy: { notifyEmail: false },
      isAvailable: false,
      consecutiveFailures: 1,
      failureThreshold: 1,
      responseTimeMs: 0,
      responseTimeThresholdMs: 3000,
      tlsValid: false,
      tlsExpiresAt: null,
      tlsExpiryThresholdDays: 14,
      error: 'HTTP_500',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });
});
