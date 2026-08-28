import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '@leadguard/config';
import type {
  PaymentProvider,
  CreateOrderInput,
  CreateOrderResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  VerifyPaymentInput,
  VerifyWebhookInput,
} from './types.js';

export type PaymentProviderMode = 'MOCK' | 'TEST' | 'LIVE';

export class RazorpayProvider implements PaymentProvider {
  public readonly mode: PaymentProviderMode;
  private readonly keyId?: string;
  private readonly keySecret?: string;
  private readonly webhookSecret?: string;

  constructor() {
    this.mode = (process.env.PAYMENT_PROVIDER_MODE as PaymentProviderMode) || 'MOCK';
    this.keyId = process.env.RAZORPAY_KEY_ID || (this.mode === 'MOCK' ? undefined : config.RAZORPAY_KEY_ID);
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || (this.mode === 'MOCK' ? undefined : config.RAZORPAY_KEY_SECRET);
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || config.RAZORPAY_WEBHOOK_SECRET;

    // Fail immediately if configured for real integration (TEST or LIVE) without credentials
    if (this.mode !== 'MOCK' && (!this.keyId || !this.keySecret)) {
      throw new Error(
        `[RazorpayProvider] Configuration error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER_MODE is '${this.mode}'`
      );
    }
  }

  private getAuthHeader(): string {
    if (!this.keyId || !this.keySecret) {
      throw new Error('[RazorpayProvider] Missing API credentials for HTTP request');
    }
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (this.mode === 'MOCK') {
      const orderId = `order_mock_${randomBytes(12).toString('hex')}`;
      return {
        orderId,
        amount: input.amountInPaise,
        currency: input.currency,
        keyId: this.keyId || 'rzp_mock_key',
      };
    }

    // Real Razorpay Orders API call for TEST / LIVE modes
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        amount: input.amountInPaise,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes || {},
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `[RazorpayProvider] Order creation failed: ${data.error?.description || response.statusText}`
      );
    }

    return {
      orderId: data.id,
      amount: data.amount,
      currency: data.currency,
      keyId: this.keyId!,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    if (this.mode === 'MOCK') {
      const subscriptionId = `sub_mock_${randomBytes(12).toString('hex')}`;
      return {
        subscriptionId,
        shortUrl: `https://rzp.io/i/${subscriptionId}`,
        status: 'active',
      };
    }

    // Real Razorpay Subscriptions API call for TEST / LIVE modes
    const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        plan_id: input.planId,
        total_count: input.totalCount || 12,
        customer_notify: 1,
        notes: input.notes || {},
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `[RazorpayProvider] Subscription creation failed: ${data.error?.description || response.statusText}`
      );
    }

    return {
      subscriptionId: data.id,
      shortUrl: data.short_url,
      status: data.status,
    };
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelImmediately = false
  ): Promise<{ cancelled: boolean }> {
    if (this.mode === 'MOCK') {
      return { cancelled: true };
    }

    // Real Razorpay Subscription Cancellation API call for TEST / LIVE modes
    const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        cancel_at_cycle_end: cancelImmediately ? 0 : 1,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `[RazorpayProvider] Subscription cancellation failed: ${data.error?.description || response.statusText}`
      );
    }

    return { cancelled: true };
  }

  /**
   * Verifies Razorpay payment signature: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPaymentSignature(input: VerifyPaymentInput): boolean {
    const secret = this.keySecret || 'mock_secret_key';
    const payload = `${input.orderId}|${input.paymentId}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

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
    const secret = input.webhookSecret || this.webhookSecret || 'mock_webhook_secret';
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
   * Generates valid signature for mock/unit tests
   */
  generateTestPaymentSignature(orderId: string, paymentId: string, customSecret?: string): string {
    const secret = customSecret || this.keySecret || 'mock_secret_key';
    const payload = `${orderId}|${paymentId}`;
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Generates valid webhook signature for mock/unit tests
   */
  generateTestWebhookSignature(rawBody: string, customSecret?: string): string {
    const secret = customSecret || this.webhookSecret || 'mock_webhook_secret';
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }
}

export const razorpayProvider = new RazorpayProvider();
