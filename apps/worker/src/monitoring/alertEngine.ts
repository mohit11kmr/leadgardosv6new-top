import { db } from '@leadguard/database';
import type { Severity } from '@prisma/client';
import type { DetectedRegression } from './types.js';

export interface AlertPolicy {
  notifyEmail?: boolean;
  minSeverity?: Severity;
  scoreDropThreshold?: number;
  cooldownMinutes?: number;
}

export class AlertEngine {
  generateFingerprint(
    configId: string,
    affectedUrl: string | undefined,
    ruleId: string,
    changeType: string
  ): string {
    const scope = affectedUrl ? affectedUrl.replace(/^https?:\/\//, '').split('?')[0] : 'site';
    return `${configId}:${scope}:${ruleId}:${changeType}`;
  }

  async processAlerts(options: {
    organizationId: string;
    websiteId: string;
    monitoringConfigId: string;
    monitoringRunId: string;
    regressions: DetectedRegression[];
    policy?: AlertPolicy | null;
    isAvailable: boolean;
    consecutiveFailures: number;
    failureThreshold: number;
    responseTimeMs: number;
    responseTimeThresholdMs: number;
    tlsValid: boolean;
    tlsExpiresAt: Date | null;
    tlsExpiryThresholdDays: number;
    error?: string;
  }) {
    const {
      organizationId,
      websiteId,
      monitoringConfigId,
      monitoringRunId,
      regressions,
      isAvailable,
      consecutiveFailures,
      failureThreshold,
      responseTimeMs,
      responseTimeThresholdMs,
      tlsValid,
      tlsExpiresAt,
      tlsExpiryThresholdDays,
      error,
    } = options;

    const createdAlerts = [];
    const now = new Date();
    const cooldownDurationMs = 60 * 60 * 1000; // 1 hour default cooldown

    // 1. Availability Outage Alert (Enforce consecutive failure threshold)
    if (!isAvailable) {
      if (consecutiveFailures >= failureThreshold) {
        const outageFingerprint = this.generateFingerprint(
          monitoringConfigId,
          undefined,
          'AVAILABILITY_OUTAGE',
          'OUTAGE'
        );

        const existingOutage = await db.monitoringAlert.findFirst({
          where: {
            monitoringConfigId,
            fingerprint: outageFingerprint,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
        });

        if (!existingOutage) {
          const alert = await db.monitoringAlert.create({
            data: {
              organizationId,
              monitoringConfigId,
              monitoringRunId,
              websiteId,
              fingerprint: outageFingerprint,
              ruleId: 'AVAILABILITY_OUTAGE',
              severity: 'CRITICAL',
              title: 'Website Downtime Detected',
              message: `Target website is unreachable (${error || 'HTTP failure'}) after ${consecutiveFailures} consecutive checks.`,
              status: 'OPEN',
              lastAlertedAt: now,
              cooldownUntil: new Date(now.getTime() + cooldownDurationMs),
            },
          });
          createdAlerts.push(alert);
        }
      }
    } else {
      // Auto-resolve any previous availability outage alerts
      await db.monitoringAlert.updateMany({
        where: {
          monitoringConfigId,
          ruleId: 'AVAILABILITY_OUTAGE',
          status: 'OPEN',
        },
        data: {
          status: 'RESOLVED',
          resolvedAt: now,
        },
      });
    }

    // 2. TLS Certificate Alerts
    if (!tlsValid && isAvailable) {
      const tlsFingerprint = this.generateFingerprint(
        monitoringConfigId,
        undefined,
        'TLS_INVALID',
        'TLS_ERROR'
      );

      const existingTls = await db.monitoringAlert.findFirst({
        where: {
          monitoringConfigId,
          fingerprint: tlsFingerprint,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
      });

      if (!existingTls) {
        const alert = await db.monitoringAlert.create({
          data: {
            organizationId,
            monitoringConfigId,
            monitoringRunId,
            websiteId,
            fingerprint: tlsFingerprint,
            ruleId: 'TLS_INVALID',
            severity: 'HIGH',
            title: 'TLS/SSL Certificate Invalid or Missing',
            message: 'Target website does not have a valid TLS/SSL certificate.',
            status: 'OPEN',
            lastAlertedAt: now,
            cooldownUntil: new Date(now.getTime() + cooldownDurationMs),
          },
        });
        createdAlerts.push(alert);
      }
    } else if (tlsExpiresAt) {
      const daysUntilExpiry = (tlsExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry <= tlsExpiryThresholdDays && daysUntilExpiry > 0) {
        const nearExpiryFingerprint = this.generateFingerprint(
          monitoringConfigId,
          undefined,
          'TLS_NEAR_EXPIRY',
          'WARNING'
        );

        const existingExpiry = await db.monitoringAlert.findFirst({
          where: {
            monitoringConfigId,
            fingerprint: nearExpiryFingerprint,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
        });

        if (!existingExpiry) {
          const alert = await db.monitoringAlert.create({
            data: {
              organizationId,
              monitoringConfigId,
              monitoringRunId,
              websiteId,
              fingerprint: nearExpiryFingerprint,
              ruleId: 'TLS_NEAR_EXPIRY',
              severity: 'MEDIUM',
              title: 'TLS Certificate Expiring Soon',
              message: `SSL/TLS certificate will expire in ${Math.round(daysUntilExpiry)} days.`,
              status: 'OPEN',
              lastAlertedAt: now,
              cooldownUntil: new Date(now.getTime() + cooldownDurationMs),
            },
          });
          createdAlerts.push(alert);
        }
      }
    }

    // 3. Performance Degradation Alert
    if (responseTimeMs > responseTimeThresholdMs && isAvailable) {
      const perfFingerprint = this.generateFingerprint(
        monitoringConfigId,
        undefined,
        'PERF_DEGRADATION',
        'SLOW_RESPONSE'
      );

      const existingPerf = await db.monitoringAlert.findFirst({
        where: {
          monitoringConfigId,
          fingerprint: perfFingerprint,
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        },
      });

      if (!existingPerf) {
        const alert = await db.monitoringAlert.create({
          data: {
            organizationId,
            monitoringConfigId,
            monitoringRunId,
            websiteId,
            fingerprint: perfFingerprint,
            ruleId: 'PERF_DEGRADATION',
            severity: 'MEDIUM',
            title: 'Performance Degradation Detected',
            message: `Response time of ${responseTimeMs}ms exceeded threshold (${responseTimeThresholdMs}ms).`,
            status: 'OPEN',
            lastAlertedAt: now,
            cooldownUntil: new Date(now.getTime() + cooldownDurationMs),
          },
        });
        createdAlerts.push(alert);
      }
    }

    // 4. Process Detected Multi-Page Regressions
    for (const regression of regressions) {
      if (regression.changeType === 'RESOLVED') {
        // Auto-resolve any previous alert for this rule and affectedUrl
        const resolvedFingerprint = this.generateFingerprint(
          monitoringConfigId,
          regression.affectedUrl,
          regression.ruleId,
          'REGRESSED'
        );
        const resolvedNewFingerprint = this.generateFingerprint(
          monitoringConfigId,
          regression.affectedUrl,
          regression.ruleId,
          'NEW'
        );

        await db.monitoringAlert.updateMany({
          where: {
            monitoringConfigId,
            fingerprint: { in: [resolvedFingerprint, resolvedNewFingerprint] },
            status: 'OPEN',
          },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
          },
        });
        continue;
      }

      // Check if severity qualifies for alert
      if (regression.severity === 'CRITICAL' || regression.severity === 'HIGH') {
        const fingerprint = this.generateFingerprint(
          monitoringConfigId,
          regression.affectedUrl,
          regression.ruleId,
          regression.changeType
        );

        const existing = await db.monitoringAlert.findFirst({
          where: {
            monitoringConfigId,
            fingerprint,
            status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          },
        });

        if (!existing) {
          const alert = await db.monitoringAlert.create({
            data: {
              organizationId,
              monitoringConfigId,
              monitoringRunId,
              websiteId,
              fingerprint,
              ruleId: regression.ruleId,
              severity: regression.severity,
              title: `Regression: ${regression.title}`,
              message: regression.affectedUrl
                ? `${regression.description} (Affected: ${regression.affectedUrl})`
                : regression.description,
              status: 'OPEN',
              lastAlertedAt: now,
              cooldownUntil: new Date(now.getTime() + cooldownDurationMs),
            },
          });
          createdAlerts.push(alert);
        }
      }
    }

    return createdAlerts;
  }
}

export const alertEngine = new AlertEngine();
