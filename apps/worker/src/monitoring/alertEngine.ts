import { db } from '@leadguard/database';
import type { Severity } from '@prisma/client';
import type { DetectedRegression } from './types.js';

export interface AlertPolicy {
  notifyEmail?: boolean;
  minSeverity?: Severity;
  scoreDropThreshold?: number;
}

export class AlertEngine {
  generateFingerprint(websiteId: string, ruleId: string, changeType: string): string {
    return `${websiteId}:${ruleId}:${changeType}`;
  }

  async processAlerts(options: {
    organizationId: string;
    websiteId: string;
    monitoringConfigId: string;
    monitoringRunId: string;
    regressions: DetectedRegression[];
    policy?: AlertPolicy | null;
    isAvailable: boolean;
    error?: string;
  }) {
    const {
      organizationId,
      websiteId,
      monitoringConfigId,
      monitoringRunId,
      regressions,
      isAvailable,
      error,
    } = options;

    const createdAlerts = [];

    // 1. Availability Outage Alert
    if (!isAvailable) {
      const outageFingerprint = this.generateFingerprint(websiteId, 'AVAILABILITY_OUTAGE', 'OUTAGE');
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
            message: `Target website is unreachable (${error || 'HTTP failure'}).`,
            status: 'OPEN',
          },
        });
        createdAlerts.push(alert);
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
          resolvedAt: new Date(),
        },
      });
    }

    // 2. Process Detected Regressions
    for (const regression of regressions) {
      if (regression.changeType === 'RESOLVED') {
        // Auto-resolve any previous alert for this rule
        await db.monitoringAlert.updateMany({
          where: {
            monitoringConfigId,
            ruleId: regression.ruleId,
            status: 'OPEN',
          },
          data: {
            status: 'RESOLVED',
            resolvedAt: new Date(),
          },
        });
        continue;
      }

      // Check if severity qualifies for alert
      if (regression.severity === 'CRITICAL' || regression.severity === 'HIGH') {
        const fingerprint = this.generateFingerprint(
          websiteId,
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
              message: regression.description,
              status: 'OPEN',
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
