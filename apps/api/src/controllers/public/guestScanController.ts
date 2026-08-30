import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { guestScanService } from '../../services/public/guestScanService.js';
import { systemGuestOrganizationService } from '../../services/systemGuestOrganizationService.js';
import { funnelEventService, FUNNEL_EVENTS } from '../../services/funnelEventService.js';
import { getClientIp } from '@leadguard/shared';

export const guestScanRouter = Router();

const guestScanSchema = z.object({
  url: z.string().url('Invalid URL format'),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

const guestFunnelEventSchema = z.object({
  scanId: z.string().uuid(),
  event: z.enum([
    FUNNEL_EVENTS.RESULT_VIEWED,
    FUNNEL_EVENTS.EXPRESS_FIX_CLICKED,
  ]),
  sessionId: z.string().min(4).max(200).optional(),
});

guestScanRouter.post('/free-scan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = guestScanSchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined || input.idempotencyKey;
    const clientIp = getClientIp(req);

    const result = await guestScanService.createGuestScan(input.url, idempotencyKey, clientIp);

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
    if (error.code === 'RATE_LIMIT_EXCEEDED' || error.code === 'DOMAIN_RATE_LIMIT_EXCEEDED') {
      return res.status(429).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
});

guestScanRouter.get('/scan/:scanId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scanId = req.params.scanId as string;

    const result = await guestScanService.getGuestScanResult(scanId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }
    next(error);
  }
});

guestScanRouter.get('/scan/:scanId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scanId = req.params.scanId as string;

    const status = await guestScanService.getGuestScanStatus(scanId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }
    next(error);
  }
});

// Internal conversion-funnel tracking for client-driven events (result viewed,
// Express Fix CTA clicked). These are analytics-only writes and are never
// exposed back to the visitor.
guestScanRouter.post('/scan/:scanId/funnel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = guestFunnelEventSchema.parse(req.body);

    // Validate the scan exists and is owned by the guest org before recording.
    const scanResult = await guestScanService.getGuestScanResult(input.scanId);
    if (!scanResult) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan not found' },
      });
    }

    const orgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();

    await funnelEventService.record({
      organizationId: orgId,
      type: input.event,
      websiteId: scanResult.website.id,
      auditId: scanResult.id,
      sessionId: input.sessionId || undefined,
      data: { clientIp: getClientIp(req) },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.json({ success: true });
  }
});