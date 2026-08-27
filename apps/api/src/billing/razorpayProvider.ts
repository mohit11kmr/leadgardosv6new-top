import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  PaymentProvider,
  CreateOrderInput,
  CreateOrderResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  VerifyPaymentInput,
  VerifyWebhookInput,
} from './types.js';

export class RazorpayProvider implements PaymentProvider {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_leadguard';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || 'secret_test_leadguard';
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_leadguard';
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    // Generate deterministic provider order ID for integration & testing
    const orderId = `order_${randomBytes(12).toString('hex')}`;
    return {
      orderId,
      amount: input.amountInPaise,
      currency: input.currency,
      keyId: this.keyId,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const subscriptionId = `sub_${randomBytes(12).toString('hex')}`;
    return {
      subscriptionId,
      shortUrl: `https://rzp.io/i/${subscriptionId}`,
      status: 'active',
    };
  }

  async cancelSubscription(
    _subscriptionId: string,
    _cancelImmediately = false
  ): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }

  /**
   * Verifies Razorpay payment signature: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPaymentSignature(input: VerifyPaymentInput): boolean {
    const payload = `${input.orderId}|${input.paymentId}`;
    const expected = createHmac('sha256', this.keySecret).update(payload).digest('hex');

    try {
      const expectedBuffer = Buffer.from(expected, 'hex');
      const actualBuffer = Buffer.from(input.signature, 'hex');
      if (expectedBuffer.length !== actualBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Verifies Razorpay Webhook signature: HMAC-SHA256(rawBody, webhookSecret)
   */
  verifyWebhookSignature(input: VerifyWebhookInput): boolean {
    const secret = input.webhookSecret || this.webhookSecret;
    const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');

    try {
      const expectedBuffer = Buffer.from(expected, 'hex');
      const actualBuffer = Buffer.from(input.signature, 'hex');
      if (expectedBuffer.length !== actualBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Helper for testing & verification to generate valid payment signatures
   */
  generateTestPaymentSignature(orderId: string, paymentId: string): string {
    const payload = `${orderId}|${paymentId}`;
    return createHmac('sha256', this.keySecret).update(payload).digest('hex');
  }

  /**
   * Helper for testing & verification to generate valid webhook signatures
   */
  generateTestWebhookSignature(rawBody: string): string {
    return createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
  }
}

export const razorpayProvider = new RazorpayProvider();
