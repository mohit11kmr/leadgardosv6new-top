import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { entitlementService } from './entitlementService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const monitoringQueue = new Queue('monitoring', { connection });

const PLAN_MONITOR_LIMITS: Record<string, number> = {
  FREE: 0,
  PRO: 5,
  AGENCY: 25,
  ENTERPRISE: 100,
};

const PLAN_RESOURCE_CAPS: Record<string, { maxPages: number; maxDepth: number; maxConcurrentRuns: number }> = {
  FREE: { maxPages: 0, maxDepth: 0, maxConcurrentRuns: 0 },
  PRO: { maxPages: 10, maxDepth: 2, maxConcurrentRuns: 2 },
  AGENCY: { maxPages: 25, maxDepth: 3, maxConcurrentRuns: 5 },
  ENTERPRISE: { maxPages: 50, maxDepth: 5, maxConcurrentRuns: 15 },
};

const FREQUENCY_MIN_PLANS: Record<string, string[]> = {
  DAILY: ['FREE', 'PRO', 'AGENCY', 'ENTERPRISE'],
  HOURLY: ['PRO', 'AGENCY', 'ENTERPRISE'],
  FIFTEEN_MINUTES: ['PRO', 'AGENCY', 'ENTERPRISE'],
  FIVE_MINUTES: ['AGENCY', 'ENTERPRISE'],
};

export class MonitoringService {
  async createMonitor(
    organizationId: string,
    input: {
      websiteId: string;
      frequency?: 'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY';
      maxPages?: number;
      maxDepth?: number;
      healthChecks?: Record<string, unknown>;
      alertPolicy?: Record<string, unknown>;
    }
  ) {
    // 1. Guard with Watchdog Entitlement Check
    const entitlement = await entitlementService.canUseMonitoring(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(
        entitlement.reason ||
          'Watchdog continuous monitoring is not included in your current plan. Upgrade to Pro or Agency.'
      );
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 2. Check Plan Monitor Count Limit
    const { plan } = await entitlementService.getOrganizationPlan(organizationId);
    const planCode = plan?.code || 'FREE';
    const limit = PLAN_MONITOR_LIMITS[planCode] ?? 0;

    const currentCount = await db.monitoringConfig.count({
      where: { organizationId, archivedAt: null },
    });

    if (currentCount >= limit) {
      const err = new Error(
        `Monitor limit reached (${currentCount}/${limit}) for your ${planCode} plan. Upgrade to add more monitored properties.`
      );
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 3. Check Frequency Entitlement
    const reqFrequency = input.frequency || 'HOURLY';
    const allowedPlans = FREQUENCY_MIN_PLANS[reqFrequency] || ['PRO'];
    if (!allowedPlans.includes(planCode)) {
      const err = new Error(
        `Monitoring frequency ${reqFrequency} requires an Agency or Enterprise subscription.`
      );
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 4. Server-Side Resource Caps (Enforce plan bounds on maxPages & maxDepth)
    const planCap = PLAN_RESOURCE_CAPS[planCode] || PLAN_RESOURCE_CAPS['PRO']!;
    const boundedMaxPages = Math.min(
      Math.max(1, input.maxPages || planCap.maxPages),
      planCap.maxPages,
      50 // Absolute platform cap
    );
    const boundedMaxDepth = Math.min(
      Math.max(0, input.maxDepth !== undefined ? input.maxDepth : planCap.maxDepth),
      planCap.maxDepth,
      5 // Absolute platform cap
    );

    // 5. Validate website belongs to organization
    const website = await db.website.findFirst({
      where: { id: input.websiteId, organizationId, deletedAt: null },
    });
    if (!website) throw new Error('Website not found or does not belong to organization');

    // 6. Create or update monitoring config
    const monitoringConfig = await db.monitoringConfig.upsert({
      where: { websiteId: input.websiteId },
      create: {
        organizationId,
        websiteId: input.websiteId,
        frequency: reqFrequency,
        maxPages: boundedMaxPages,
        maxDepth: boundedMaxDepth,
        healthChecks: (input.healthChecks as object) || { tls: true, http: true, responseTimeThresholdMs: 3000 },
        alertPolicy: (input.alertPolicy as object) || { notifyEmail: true, minSeverity: 'HIGH' },
        enabled: true,
        archivedAt: null,
      },
      update: {
        frequency: reqFrequency,
        maxPages: boundedMaxPages,
        maxDepth: boundedMaxDepth,
        healthChecks: (input.healthChecks as object) || undefined,
        alertPolicy: (input.alertPolicy as object) || undefined,
        enabled: true,
        archivedAt: null,
      },
      include: { website: true },
    });

    // 7. Enqueue initial immediate monitoring execution
    await monitoringQueue.add('execute-monitor', {
      monitoringConfigId: monitoringConfig.id,
      triggeredBy: 'MANUAL',
      expectedBaselineVersion: monitoringConfig.baselineVersion,
    });

    return monitoringConfig;
  }

  async listMonitors(organizationId: string) {
    return db.monitoringConfig.findMany({
      where: { organizationId, archivedAt: null },
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
      where: { id: monitorId, organizationId, archivedAt: null },
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
      maxPages?: number;
      maxDepth?: number;
      healthChecks?: Record<string, unknown>;
      alertPolicy?: Record<string, unknown>;
    }
  ) {
    // 1. Verify monitor belongs to organization
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId, archivedAt: null },
    });
    if (!config) throw new Error('Monitor not found');

    const { plan } = await entitlementService.getOrganizationPlan(organizationId);
    const planCode = plan?.code || 'FREE';
    const planCap = PLAN_RESOURCE_CAPS[planCode] || PLAN_RESOURCE_CAPS['PRO']!;

    // 2. If changing frequency or re-enabling, verify plan entitlement
    if (input.frequency || input.enabled === true) {
      const entitlement = await entitlementService.canUseMonitoring(organizationId);
      if (!entitlement.allowed) {
        const err = new Error(
          entitlement.reason || 'Monitoring requires an active Pro or Agency subscription.'
        );
        (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
        throw err;
      }

      if (input.frequency) {
        const allowedPlans = FREQUENCY_MIN_PLANS[input.frequency] || ['PRO'];
        if (!allowedPlans.includes(planCode)) {
          const err = new Error(
            `Monitoring frequency ${input.frequency} requires an Agency or Enterprise subscription.`
          );
          (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
          throw err;
        }
      }
    }

    // 3. Clamp resource limits
    const boundedMaxPages = input.maxPages
      ? Math.min(Math.max(1, input.maxPages), planCap.maxPages, 50)
      : undefined;
    const boundedMaxDepth = input.maxDepth !== undefined
      ? Math.min(Math.max(0, input.maxDepth), planCap.maxDepth, 5)
      : undefined;

    return db.monitoringConfig.update({
      where: { id: monitorId },
      data: {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.frequency ? { frequency: input.frequency } : {}),
        ...(boundedMaxPages ? { maxPages: boundedMaxPages } : {}),
        ...(boundedMaxDepth !== undefined ? { maxDepth: boundedMaxDepth } : {}),
        ...(input.healthChecks ? { healthChecks: input.healthChecks as object } : {}),
        ...(input.alertPolicy ? { alertPolicy: input.alertPolicy as object } : {}),
      },
      include: { website: true },
    });
  }

  async deleteMonitor(organizationId: string, monitorId: string, hardDelete = false) {
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    if (hardDelete) {
      await db.monitoringFinding.deleteMany({ where: { monitoringConfigId: monitorId } });
      await db.monitoringAlert.deleteMany({ where: { monitoringConfigId: monitorId } });
      await db.monitoringRun.deleteMany({ where: { monitoringConfigId: monitorId } });
      return db.monitoringConfig.delete({ where: { id: monitorId } });
    }

    // Soft delete / Archival (Default)
    return db.monitoringConfig.update({
      where: { id: monitorId },
      data: {
        enabled: false,
        archivedAt: new Date(),
      },
    });
  }

  async getRuns(organizationId: string, monitorId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    const runs = await db.monitoringRun.findMany({
      where: { monitoringConfigId: monitorId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = runs.length > limit;
    const items = hasNextPage ? runs.slice(0, limit) : runs;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return { items, hasNextPage, nextCursor };
  }

  async getFindings(organizationId: string, monitorId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(100, options.limit || 25));
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    const findings = await db.monitoringFinding.findMany({
      where: { monitoringConfigId: monitorId },
      orderBy: { detectedAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = findings.length > limit;
    const items = hasNextPage ? findings.slice(0, limit) : findings;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return { items, hasNextPage, nextCursor };
  }

  async getAlerts(organizationId: string, monitorId: string, options: { cursor?: string; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const config = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
    });
    if (!config) throw new Error('Monitor not found');

    const alerts = await db.monitoringAlert.findMany({
      where: { monitoringConfigId: monitorId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = alerts.length > limit;
    const items = hasNextPage ? alerts.slice(0, limit) : alerts;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return { items, hasNextPage, nextCursor };
  }

  async acknowledgeAlert(organizationId: string, monitorId: string, alertId: string) {
    // Cross-monitor & cross-organization IDOR protection:
    const alert = await db.monitoringAlert.findFirst({
      where: {
        id: alertId,
        organizationId,
        monitoringConfigId: monitorId,
      },
    });
    if (!alert) throw new Error('Alert not found or does not match monitor and organization');

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
      where: { id: monitorId, organizationId, archivedAt: null },
    });
    if (!config) throw new Error('Monitor not found');

    // 1. Server-Side Rate Limiting on Manual Runs (Max 10 manual runs per 60 seconds per org)
    const rateLimitKey = `rate:mon:manual:${organizationId}`;
    const currentCount = await connection.incr(rateLimitKey);
    if (currentCount === 1) {
      await connection.expire(rateLimitKey, 60);
    }
    if (currentCount > 10) {
      const err = new Error('Manual monitoring scan rate limit exceeded. Please wait a minute before triggering again.');
      (err as unknown as { code: string }).code = 'RATE_LIMIT_EXCEEDED';
      throw err;
    }

    // 2. Global Organization Concurrency Limit Check
    const { plan } = await entitlementService.getOrganizationPlan(organizationId);
    const planCode = plan?.code || 'FREE';
    const planCap = PLAN_RESOURCE_CAPS[planCode] || PLAN_RESOURCE_CAPS['PRO']!;

    const activeRunsCount = await db.monitoringRun.count({
      where: { organizationId, status: 'RUNNING' },
    });
    if (activeRunsCount >= planCap.maxConcurrentRuns) {
      return {
        enqueued: false,
        status: 'ORG_CONCURRENCY_LIMIT_REACHED',
        message: `Organization active monitor limit reached (${activeRunsCount}/${planCap.maxConcurrentRuns}). Please wait for active runs to finish.`,
      };
    }

    // 3. Per-Monitor Active Lock (Idempotency & Concurrent Click Protection)
    const manualLockKey = `mon:lock:manual:${monitorId}`;
    const acquired = await connection.set(manualLockKey, '1', 'EX', 30, 'NX');
    if (!acquired) {
      return {
        enqueued: false,
        status: 'MONITOR_RUN_IN_PROGRESS',
        message: 'Scan already in progress for this monitor.',
      };
    }

    // Check DB for any actively running job for this monitor
    const activeRun = await db.monitoringRun.findFirst({
      where: { monitoringConfigId: monitorId, status: 'RUNNING' },
    });
    if (activeRun) {
      return {
        enqueued: false,
        status: 'MONITOR_RUN_IN_PROGRESS',
        runId: activeRun.id,
        message: 'Scan already in progress for this monitor.',
      };
    }

    const job = await monitoringQueue.add('execute-monitor', {
      monitoringConfigId: monitorId,
      triggeredBy: 'MANUAL',
      expectedBaselineVersion: config.baselineVersion,
    });

    return { enqueued: true, status: 'ENQUEUED', jobId: job.id };
  }
}

export const monitoringService = new MonitoringService();
