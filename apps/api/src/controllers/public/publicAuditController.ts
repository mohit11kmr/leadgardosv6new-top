import { Router, type Request, type Response, type NextFunction } from 'express';
import { apiKeyService } from '../../services/apiKeyService.js';
import { publicAuditService } from '../../services/public/publicAuditService.js';

export const publicAuditRouter = Router();

// Trigger an audit via Public API (scope: AUDIT_RUN)
publicAuditRouter.post('/', apiKeyService.requireScope('AUDIT_RUN', 'AUDIT_RUN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;
    const { url, websiteId } = req.body;

    const result = await publicAuditService.createAudit(organizationId, { url, websiteId }, idempotencyKey);

    res.status(201).json({
      success: true,
      data: result,
      meta: {
        idempotencyKey: idempotencyKey || null,
      },
    });
  } catch (error: any) {
    if (error.code === 'INVALID_REQUEST' || error.code === 'SSRF_BLOCKED') {
      return res.status(400).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

// List audits via Public API with cursor pagination (scope: AUDIT_READ)
publicAuditRouter.get('/', apiKeyService.requireScope('AUDIT_READ', 'READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const limit = Number(req.query.limit) || 20;
    const cursor = req.query.cursor as string | undefined;

    const result = await publicAuditService.listAudits(organizationId, { cursor, limit });

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

// Get audit details via Public API (scope: AUDIT_READ)
publicAuditRouter.get('/:id', apiKeyService.requireScope('AUDIT_READ', 'READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const auditId = req.params.id as string;

    const result = await publicAuditService.getAudit(organizationId, auditId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found' },
      });
    }
    next(error);
  }
});
