import { describe, it, expect } from 'vitest';
import { RazorpayProvider } from '../../apps/api/src/billing/razorpayProvider.js';

describe('Billing: Real Razorpay Sandbox API Integration (TEST Mode)', () => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  // Only run against genuine sandbox credentials (real rzp_test_ keys), never
  // against the placeholder fixtures used by the deterministic MOCK suite.
  const hasRealCredentials =
    Boolean(keyId) && Boolean(keySecret) && !keyId.includes('placeholder') && !keySecret.includes('placeholder');

  it.runIf(hasRealCredentials)(
    'creates a real order on Razorpay Sandbox via HTTPS REST API',
    async () => {
      const originalMode = process.env.PAYMENT_PROVIDER_MODE;
      try {
        process.env.PAYMENT_PROVIDER_MODE = 'TEST';
        const provider = new RazorpayProvider();

        expect(provider.mode).toBe('TEST');

        const order = await provider.createOrder({
          amountInPaise: 299900,
          currency: 'INR',
          receipt: `test_live_${Date.now()}`,
          notes: { test: 'true', platform: 'LeadGuard OS V6' },
        });

        expect(order.orderId).toBeDefined();
        // Real Razorpay order IDs begin with 'order_' (e.g. order_PhXYZ...)
        expect(order.orderId).toMatch(/^order_[A-Za-z0-9]+$/);
        expect(order.orderId).not.toContain('mock');
        expect(order.amount).toBe(299900);
        expect(order.currency).toBe('INR');
      } finally {
        process.env.PAYMENT_PROVIDER_MODE = originalMode || 'MOCK';
      }
    }
  );
});
