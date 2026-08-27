import { Router, type Request, type Response, type NextFunction } from 'express';
import { apiKeyService } from '../../services/apiKeyService.js';
import { publicMonitoringService } from '../../services/public/publicMonitoringService.js';

export const publicMonitoringRouter = Router();

// List monitors via Public API (scope: MONITORING_READ)
publicMonitoringRouter.get('/', apiKeyService.requireScope('MONITORING_READ', 'READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const limit = Number(req.query.limit) || 20;
    const cursor = req.query.cursor as string | undefined;

    const result = await publicMonitoringService.listMonitors(organizationId, { cursor, limit });

    res.json({
      success: true,
      data: result,
      meta: {
        nextCursor: result.nextCursor,
        hasNextPage: result.hasNextPage,
        limit: result.limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get monitor status via Public API (scope: MONITORING_READ)
publicMonitoringRouter.get('/:id/status', apiKeyService.requireScope('MONITORING_READ', 'READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const monitorId = req.params.id as string;

    const result = await publicMonitoringService.getMonitorStatus(organizationId, monitorId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Monitor not found' },
      });
    }
    next(error);
  }
});

// Run monitor health check on demand (scope: MONITORING_RUN)
publicMonitoringRouter.post('/:id/run', apiKeyService.requireScope('MONITORING_RUN', 'MONITORING_RUN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const monitorId = req.params.id as string;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey;

    const result = await publicMonitoringService.runMonitor(organizationId, monitorId, idempotencyKey);

    res.json({
      success: true,
      data: result,
      meta: {
        idempotencyKey: idempotencyKey || null,
      },
    });
  } catch (error: any) {
    if (error.code === 'MONITOR_RUN_IN_PROGRESS') {
      return res.status(409).json({
        success: false,
        error: { code: 'MONITOR_RUN_IN_PROGRESS', message: error.message },
      });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Monitor not found' },
      });
    }
    next(error);
  }
});
