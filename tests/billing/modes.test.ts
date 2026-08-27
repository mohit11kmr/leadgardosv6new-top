import { describe, it, expect } from 'vitest';
import { RazorpayProvider } from '../../apps/api/src/billing/razorpayProvider.js';

describe('Billing: Provider Modes & Secret Validation (Requirement 3, 4, 5, 6)', () => {
  it('throws configuration error if initialized in TEST or LIVE mode without credentials', () => {
    const originalMode = process.env.PAYMENT_PROVIDER_MODE;
    const originalKey = process.env.RAZORPAY_KEY_ID;
    const originalSecret = process.env.RAZORPAY_KEY_SECRET;

    try {
      process.env.PAYMENT_PROVIDER_MODE = 'TEST';
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;

      expect(() => new RazorpayProvider()).toThrowError(
        /Configuration error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required/
      );
    } finally {
      process.env.PAYMENT_PROVIDER_MODE = originalMode || 'MOCK';
      if (originalKey) process.env.RAZORPAY_KEY_ID = originalKey;
      if (originalSecret) process.env.RAZORPAY_KEY_SECRET = originalSecret;
    }
  });

  it('runs deterministically in MOCK mode without external network calls', async () => {
    const originalMode = process.env.PAYMENT_PROVIDER_MODE;
    try {
      process.env.PAYMENT_PROVIDER_MODE = 'MOCK';
      const provider = new RazorpayProvider();
      expect(provider.mode).toBe('MOCK');

      const order = await provider.createOrder({
        amountInPaise: 299900,
        currency: 'INR',
        receipt: 'test_rcpt',
      });

      expect(order.orderId).toContain('order_mock_');
      expect(order.amount).toBe(299900);
      expect(order.currency).toBe('INR');

      const sub = await provider.createSubscription({
        planId: 'plan_test',
        customerEmail: 'test@example.com',
      });

      expect(sub.subscriptionId).toContain('sub_mock_');
      expect(sub.status).toBe('active');
    } finally {
      process.env.PAYMENT_PROVIDER_MODE = originalMode || 'MOCK';
    }
  });
});
