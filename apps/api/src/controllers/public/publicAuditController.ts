import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@leadguard/database';
import { apiKeyService } from '../../services/apiKeyService.js';
import { auditQueue } from '../../queue.js';
import { normalizeUrl } from '@leadguard/shared';

export const publicAuditRouter = Router();

// Trigger an audit via Public API (scope: AUDIT_RUN)
publicAuditRouter.post('/', apiKeyService.requireScope('AUDIT_RUN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const { url, websiteId } = req.body;

    if (!url && !websiteId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'url or websiteId is required' },
      });
    }

    let targetWebsiteId = websiteId;

    if (!targetWebsiteId && url) {
      const normalized = normalizeUrl(url);
      let website = await db.website.findFirst({
        where: { organizationId, normalizedUrl: normalized },
      });

      if (!website) {
        const domain = new URL(normalized).hostname;
        website = await db.website.create({
          data: {
            organizationId,
            url,
            domain,
            normalizedUrl: normalized,
            name: domain,
          },
        });
      }
      targetWebsiteId = website.id;
    }

    const audit = await db.audit.create({
      data: {
        organizationId,
        websiteId: targetWebsiteId,
        status: 'QUEUED',
      },
    });

    await auditQueue.add('run-audit', { auditId: audit.id });

    res.status(201).json({
      success: true,
      data: {
        id: audit.id,
        websiteId: audit.websiteId,
        status: audit.status,
        createdAt: audit.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// List audits via Public API with cursor pagination (scope: AUDIT_READ)
publicAuditRouter.get('/', apiKeyService.requireScope('AUDIT_READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const cursor = req.query.cursor as string | undefined;

    const audits = await db.audit.findMany({
      where: { organizationId },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        website: { select: { id: true, url: true, name: true } },
        score: true,
      },
    });

    const hasMore = audits.length > limit;
    const items = hasMore ? audits.slice(0, limit) : audits;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    res.json({
      success: true,
      data: {
        items: items.map((a) => ({
          id: a.id,
          website: a.website,
          status: a.status,
          score: a.score
            ? {
                overall: a.score.overall,
                lead: a.score.lead,
                advertising: a.score.advertising,
                seo: a.score.seo,
                security: a.score.security,
              }
            : null,
          createdAt: a.createdAt,
        })),
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get audit details via Public API (scope: AUDIT_READ)
publicAuditRouter.get('/:id', apiKeyService.requireScope('AUDIT_READ'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).organizationId;
    const auditId = req.params.id as string;
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: {
        website: { select: { id: true, url: true, name: true } },
        score: true,
        findings: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            severity: true,
            scoreImpact: true,
            recommendation: true,
          },
        },
      },
    });

    if (!audit) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found' },
      });
    }

    res.json({
      success: true,
      data: {
        id: audit.id,
        website: audit.website,
        status: audit.status,
        score: audit.score
          ? {
              overall: audit.score.overall,
              lead: audit.score.lead,
              advertising: audit.score.advertising,
              seo: audit.score.seo,
              security: audit.score.security,
            }
          : null,
        findings: audit.findings,
        createdAt: audit.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});
