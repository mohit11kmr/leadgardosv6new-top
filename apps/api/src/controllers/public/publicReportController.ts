import { Router, type Request, type Response, type NextFunction } from 'express';
import { apiKeyService } from '../../services/apiKeyService.js';
import { publicReportService } from '../../services/public/publicReportService.js';

export const publicReportRouter = Router();

// List reports via Public API (scope: REPORT_READ)
publicReportRouter.get('/', apiKeyService.requireScope('REPORT_READ', 'READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const limit = Number(req.query.limit) || 20;
    const cursor = req.query.cursor as string | undefined;

    const result = await publicReportService.listReports(organizationId, { cursor, limit });

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

// Get report details via Public API (scope: REPORT_READ)
publicReportRouter.get('/:id', apiKeyService.requireScope('REPORT_READ', 'READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const reportId = req.params.id as string;

    const result = await publicReportService.getReport(organizationId, reportId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }
    next(error);
  }
});
