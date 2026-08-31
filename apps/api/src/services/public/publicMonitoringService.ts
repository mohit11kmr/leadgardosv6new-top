import { db } from '@leadguard/database';
import { decodeCursor, encodeCursor, buildCursorWhereClause } from '@leadguard/shared';
import { monitoringQueue } from '../../queue.js';
import type {
  PublicMonitorDTO,
  PublicMonitorStatusDTO,
  PaginatedResult,
} from '../../dtos/public.js';

export class PublicMonitoringService {
  /**
   * Lists monitors for an organization with deterministic (createdAt, id) tuple cursor pagination
   */
  async listMonitors(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<PublicMonitorDTO>> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const decodedCursor = decodeCursor(options.cursor);
    const cursorFilter = buildCursorWhereClause(decodedCursor);

    const where: any = { organizationId, archivedAt: null };
    if (cursorFilter) {
      where.AND = [cursorFilter];
    }

    const monitors = await db.monitoringConfig.findMany({
      where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
      },
    });

    const hasMore = monitors.length > limit;
    const items = hasMore ? monitors.slice(0, limit) : monitors;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null;

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
   * Executes a monitor health check on demand with database-backed idempotency & active run conflict protection
   */
  async runMonitor(
    organizationId: string,
    monitorId: string,
    idempotencyKey?: string
  ): Promise<{ jobId: string; status: string; websiteUrl: string; reused?: boolean }> {
    const monitor = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId, archivedAt: null },
      include: { website: true },
    });

    if (!monitor) {
      const err = new Error('Monitor not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    // 1. Idempotency Check: When key is supplied, return existing run if already initiated
    if (idempotencyKey) {
      const existingRun = await db.monitoringRun.findFirst({
        where: {
          monitoringConfigId: monitor.id,
          idempotencyKey,
        },
      });

      if (existingRun) {
        return {
          jobId: existingRun.id,
          status: existingRun.status,
          websiteUrl: monitor.website.url,
          reused: true,
        };
      }
    } else {
      // 2. Without Idempotency-Key: Prevent overlapping runs if check is already active (QUEUED or RUNNING)
      const activeRun = await db.monitoringRun.findFirst({
        where: {
          monitoringConfigId: monitor.id,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });

      if (activeRun) {
        const err = new Error('A health check run is already in progress for this monitor.');
        (err as any).code = 'MONITOR_RUN_IN_PROGRESS';
        throw err;
      }
    }

    // Create database monitoring run record
    let run;
    try {
      run = await db.monitoringRun.create({
        data: {
          monitoringConfigId: monitor.id,
          websiteId: monitor.websiteId,
          organizationId,
          idempotencyKey: idempotencyKey || null,
          status: 'QUEUED',
        },
      });
    } catch (error: any) {
      // C14: concurrent same-key requests — unique(monitoringConfigId, idempotencyKey) is the real guard
      if (error?.code === 'P2002' && idempotencyKey) {
        const existingRun = await db.monitoringRun.findFirst({
          where: {
            monitoringConfigId: monitor.id,
            idempotencyKey,
          },
        });
        if (existingRun) {
          const monitorCheck = await db.monitoringConfig.findFirst({
            where: { id: monitor.id, organizationId },
            include: { website: true },
          });
          return {
            jobId: existingRun.id,
            status: existingRun.status,
            websiteUrl: monitorCheck?.website?.url ?? monitor.website.url,
            reused: true,
          };
        }
      }
      throw error;
    }

    const job = await monitoringQueue.add(
      'execute-monitor',
      {
        runId: run.id,
        configId: monitor.id,
        websiteId: monitor.websiteId,
        url: monitor.website.url,
        organizationId,
        idempotencyKey: idempotencyKey || null,
      },
      idempotencyKey ? { jobId: `manual-monitor-${monitor.id}-${idempotencyKey}` } : {}
    );

    return {
      jobId: run.id,
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
