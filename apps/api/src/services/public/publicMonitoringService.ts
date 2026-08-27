import { db } from '@leadguard/database';
import { monitoringQueue } from '../../queue.js';
import type {
  PublicMonitorDTO,
  PublicMonitorStatusDTO,
  PublicMonitorRunDTO,
  PaginatedResult,
} from '../../dtos/public.js';

export class PublicMonitoringService {
  /**
   * Lists monitors for an organization with cursor pagination
   */
  async listMonitors(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<PublicMonitorDTO>> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const cursor = options.cursor;

    const monitors = await db.monitoringConfig.findMany({
      where: { organizationId, archivedAt: null },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
      },
    });

    const hasMore = monitors.length > limit;
    const items = hasMore ? monitors.slice(0, limit) : monitors;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map((m) => this.formatMonitorDto(m)),
      nextCursor,
      hasNextPage: hasMore,
      hasMore,
      limit,
    };
  }

  /**
   * Retrieves monitor status, active alert counts, and bounded latest runs
   */
  async getMonitorStatus(organizationId: string, monitorId: string): Promise<PublicMonitorStatusDTO> {
    const monitor = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId, archivedAt: null },
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
      },
    });

    if (!monitor) {
      const err = new Error('Monitor not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    // Bounded latest runs (max 10)
    const latestRuns = await db.monitoringRun.findMany({
      where: { monitoringConfigId: monitor.id },
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        responseTimeMs: true,
        httpStatus: true,
        createdAt: true,
      },
    });

    // Active alert semantics: Canonical status OPEN or ACKNOWLEDGED
    const activeAlertsCount = await db.monitoringAlert.count({
      where: {
        monitoringConfigId: monitor.id,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
    });

    return {
      monitor: this.formatMonitorDto(monitor),
      activeAlertsCount,
      latestRuns: latestRuns.map((r) => ({
        id: r.id,
        status: r.status,
        durationMs: r.responseTimeMs,
        httpStatus: r.httpStatus,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    };
  }

  /**
   * Executes a monitor health check on demand with idempotency & concurrency protection
   */
  async runMonitor(
    organizationId: string,
    monitorId: string,
    idempotencyKey?: string
  ): Promise<{ jobId: string; status: string; websiteUrl: string }> {
    const monitor = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId, archivedAt: null },
      include: { website: true },
    });

    if (!monitor) {
      const err = new Error('Monitor not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const job = await monitoringQueue.add(
      'execute-monitor',
      {
        configId: monitor.id,
        websiteId: monitor.websiteId,
        url: monitor.website.url,
        organizationId,
        idempotencyKey: idempotencyKey || null,
      },
      idempotencyKey ? { jobId: `manual-monitor-${monitor.id}-${idempotencyKey}` } : {}
    );

    return {
      jobId: job.id || `job-${Date.now()}`,
      status: 'QUEUED',
      websiteUrl: monitor.website.url,
    };
  }

  private formatMonitorDto(m: any): PublicMonitorDTO {
    return {
      id: m.id,
      website: {
        id: m.website.id,
        name: m.website.name,
        url: m.website.url,
        domain: m.website.domain,
      },
      enabled: m.enabled,
      frequency: m.frequency,
      failureThreshold: m.failureThreshold,
      responseTimeThresholdMs: m.responseTimeThresholdMs,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
    };
  }
}

export const publicMonitoringService = new PublicMonitoringService();
