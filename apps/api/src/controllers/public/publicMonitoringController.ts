import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@leadguard/database';
import { apiKeyService } from '../../services/apiKeyService.js';
import { monitoringQueue } from '../../queue.js';

export const publicMonitoringRouter = Router();

// List monitors via Public API (scope: MONITORING_READ)
publicMonitoringRouter.get('/', apiKeyService.requireScope('MONITORING_READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const monitors = await db.monitoringConfig.findMany({
      where: { organizationId },
      include: {
        website: { select: { id: true, url: true, name: true } },
      },
    });

    res.json({
      success: true,
      data: monitors.map((m) => ({
        id: m.id,
        website: m.website,
        enabled: m.enabled,
        frequency: m.frequency,
        failureThreshold: m.failureThreshold,
        responseTimeThresholdMs: m.responseTimeThresholdMs,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Get monitor status via Public API (scope: MONITORING_READ)
publicMonitoringRouter.get('/:id/status', apiKeyService.requireScope('MONITORING_READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const monitorId = req.params.id as string;
    const monitor = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
      include: {
        website: { select: { id: true, url: true, name: true } },
      },
    });

    if (!monitor) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Monitor not found' },
      });
    }

    const latestRuns = await db.monitoringRun.findMany({
      where: { monitoringConfigId: monitor.id },
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const activeAlerts = await db.monitoringAlert.findMany({
      where: { monitoringConfigId: monitor.id, acknowledgedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        monitor: {
          id: monitor.id,
          website: monitor.website,
          enabled: monitor.enabled,
          frequency: monitor.frequency,
        },
        activeAlertsCount: activeAlerts.length,
        latestRuns: latestRuns.map((r) => ({
          id: r.id,
          status: r.status,
          durationMs: r.responseTimeMs,
          httpStatus: r.httpStatus,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Run monitor health check on demand (scope: MONITORING_RUN)
publicMonitoringRouter.post('/:id/run', apiKeyService.requireScope('MONITORING_RUN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const monitorId = req.params.id as string;
    const monitor = await db.monitoringConfig.findFirst({
      where: { id: monitorId, organizationId },
      include: { website: true },
    });

    if (!monitor) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Monitor not found' },
      });
    }

    const job = await monitoringQueue.add('execute-monitor', {
      configId: monitor.id,
      websiteId: monitor.websiteId,
      url: monitor.website.url,
      organizationId,
    });

    res.json({
      success: true,
      data: {
        jobId: job.id,
        status: 'QUEUED',
        website: monitor.website.url,
      },
    });
  } catch (error) {
    next(error);
  }
});
