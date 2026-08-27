import { Router, type Request, type Response, type NextFunction } from 'express';
import { reportService } from '../../services/reportService.js';
import { apiKeyService } from '../../services/apiKeyService.js';

export const publicReportRouter = Router();

// List reports via Public API (scope: REPORT_READ)
publicReportRouter.get('/', apiKeyService.requireScope('REPORT_READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const cursor = req.query.cursor as string | undefined;

    const result = await reportService.listReports(organizationId, { cursor, limit });
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// Get report details via Public API (scope: REPORT_READ)
publicReportRouter.get('/:id', apiKeyService.requireScope('REPORT_READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const reportId = req.params.id as string;
    const report = await reportService.getReport(organizationId, reportId);
    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});
