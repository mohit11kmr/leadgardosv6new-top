import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { entitlementService } from './entitlementService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const monitoringQueue = new Queue('monitoring', { connection });

export class MonitoringService {
  async createMonitor(
    organizationId: string,
    input: {
      websiteId: string;
      frequency?: 'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY';
      healthChecks?: Record<string, unknown>;
      alertPolicy?: Record<string, unknown>;
    }
  ) {
    // 1. Guard with Watchdog Entitlement Check
    const entitlement = await entitlementService.canUseMonitoring(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(
        entitlement.reason ||
          'Watchdog continuous monitoring is not included in your current plan. Upgrade to Pro, Agency, or Watchdog 24/7 add-on.'
      );
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 2. Validate website belongs to organization
    const website = await db.website.findFirst({
      where: { id: input.websiteId, organizationId, deletedAt: null },
    });
    if (!website) throw new Error('Website not found or does not belong to organization');

    // 3. Create or update monitoring config
    const monitoringConfig = await db.monitoringConfig.upsert({
      where: { websiteId: input.websiteId },
      create: {
        organizationId,
        websiteId: input.websiteId,
        frequency: input.frequency || 'HOURLY',
        healthChecks: (input.healthChecks as object) || { tls: true, http: true, responseTimeThresholdMs: 3000 },
        alertPolicy: (input.alertPolicy as object) || { notifyEmail: true, minSeverity: 'HIGH' },
        enabled: true,
      },
      update: {
        frequency: input.frequency || 'HOURLY',
        healthChecks: (input.healthChecks as object) || undefined,
        alertPolicy: (input.alertPolicy as object) || undefined,
        enabled: true,
      },
      include: { website: true },
    });

    // 4. Enqueue initial immediate monitoring execution
    await monitoringQueue.add('execute-monitor', {
      monitoringConfigId: monitoringConfig.id,
      triggeredBy: 'MANUAL',
    });

    return monitoringConfig;
  }

  async listMonitors(organizationId: string) {
    return db.monitoringConfig.findMany({
      where: { organizationId },
      include: {
        website: true,
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        alerts: {
          where: { status: 'OPEN' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMonitor(organizationId: string, monitorId: string) {
    return db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
      include: {
        website: true,
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        findings: {
          orderBy: { detectedAt: 'desc' },
          take: 25,
        },
        alerts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async updateMonitor(
    organizationId: string,
    monitorId: string,
    input: {
      enabled?: boolean;
      frequency?: 'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY';
      healthChecks?: Record<string, unknown>;
      alertPolicy?: Record<string, unknown>;
    }
  ) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    return db.monitoringConfig.update({
      where: { id: monitorId },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.frequency ? { frequency: input.frequency } : {}),
        ...(input.healthChecks ? { healthChecks: input.healthChecks as object } : {}),
        ...(input.alertPolicy ? { alertPolicy: input.alertPolicy as object } : {}),
      },
      include: { website: true },
    });
  }

  async deleteMonitor(organizationId: string, monitorId: string) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    await db.monitoringFinding.deleteMany({ where: { monitoringConfigId: monitorId } });
    await db.monitoringAlert.deleteMany({ where: { monitoringConfigId: monitorId } });
    await db.monitoringRun.deleteMany({ where: { monitoringConfigId: monitorId } });
    return db.monitoringConfig.delete({ where: { id: monitorId } });
  }

  async getRuns(organizationId: string, monitorId: string) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    return db.monitoringRun.findMany({
      where: { monitoringConfigId: monitorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getFindings(organizationId: string, monitorId: string) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    return db.monitoringFinding.findMany({
      where: { monitoringConfigId: monitorId },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });
  }

  async getAlerts(organizationId: string, monitorId: string) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    return db.monitoringAlert.findMany({
      where: { monitoringConfigId: monitorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async acknowledgeAlert(organizationId: string, alertId: string) {
    const alert = await db.monitoringAlert.findFirst({
      where: { id: alertId, organizationId },
    });
    if (!alert) throw new Error('Alert not found');

    return db.monitoringAlert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
      },
    });
  }

  async triggerManualRun(organizationId: string, monitorId: string) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    const job = await monitoringQueue.add('execute-monitor', {
      monitoringConfigId: monitorId,
      triggeredBy: 'MANUAL',
    });

    return { enqueued: true, jobId: job.id };
  }
}

export const monitoringService = new MonitoringService();
