import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { billingService } from '../../services/billingService.js';
import { guestScanService } from '../../services/public/guestScanService.js';
import { getClientIp } from '@leadguard/shared';

export const guestExpressFixRouter = Router();

const guestExpressFixCheckoutSchema = z.object({
  scanId: z.string().uuid(),
  email: z.string().email('Invalid email address'),
  name: z.string().min(1).max(100).optional(),
});

const guestExpressFixVerifySchema = z.object({
  orderId: z.string().min(5),
  paymentId: z.string().min(5),
  signature: z.string().min(10),
  scanId: z.string().uuid(),
});

guestExpressFixRouter.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = guestExpressFixCheckoutSchema.parse(req.body);
    const clientIp = getClientIp(req);

    // Get the guest scan to validate it exists and belongs to guest organization
    const scanResult = await guestScanService.getGuestScanResult(input.scanId);
    if (!scanResult) {
      return res.status(404).json({
        success: false,
        error: { code: 'SCAN_NOT_FOUND', message: 'Scan not found or not accessible' },
      });
    }

    // Verify scan is completed
    if (scanResult.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: { code: 'SCAN_NOT_COMPLETED', message: 'Scan must be completed before purchasing Express Fix' },
      });
    }

    const websiteId = scanResult.website.id;
    const auditId = scanResult.id;

    // Create Express Fix checkout order
    const order = await billingService.createGuestExpressFixCheckout(
      websiteId,
      auditId,
      input.email,
      input.name
    );

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    if (error.code === 'INVALID_REQUEST' || error.code === 'SCAN_NOT_FOUND' || error.code === 'SCAN_NOT_COMPLETED') {
      return res.status(400).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
});

guestExpressFixRouter.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = guestExpressFixVerifySchema.parse(req.body);

    // Get the guest scan to validate it exists and belongs to guest organization
    const scanResult = await guestScanService.getGuestScanResult(input.scanId);
    if (!scanResult) {
      return res.status(404).json({
        success: false,
        error: { code: 'SCAN_NOT_FOUND', message: 'Scan not found or not accessible' },
      });
    }

    const websiteId = scanResult.website.id;
    const auditId = scanResult.id;

    // Verify the payment
    const result = await billingService.verifyGuestExpressFixPayment(
      input.orderId,
      input.paymentId,
      input.signature,
      websiteId,
      auditId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.code === 'INVALID_REQUEST' || error.code === 'SCAN_NOT_FOUND') {
      return res.status(400).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
});

// Public status endpoint for payment recovery
guestExpressFixRouter.get('/status/:fulfillmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fulfillmentId = req.params.fulfillmentId as string;

    const status = await billingService.getExpressFixFulfillmentStatus(fulfillmentId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Fulfillment not found' },
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
        error: { code: 'NOT_FOUND', message: 'Fulfillment not found' },
      });
    }
    next(error);
  }
});