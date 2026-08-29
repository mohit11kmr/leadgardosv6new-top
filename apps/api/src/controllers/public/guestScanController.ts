import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { guestScanService } from '../../services/public/guestScanService.js';

export const guestScanRouter = Router();

const guestScanSchema = z.object({
  url: z.string().url('Invalid URL format'),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

guestScanRouter.post('/free-scan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = guestScanSchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined || input.idempotencyKey;

    const result = await guestScanService.createGuestScan(input.url, idempotencyKey);

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