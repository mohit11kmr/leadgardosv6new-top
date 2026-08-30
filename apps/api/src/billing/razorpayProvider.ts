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
  RazorpayOrder,
  RazorpayPayment,
} from './types.js';

export type PaymentProviderMode = 'MOCK' | 'TEST' | 'LIVE';

export class RazorpayProvider implements PaymentProvider {
  public readonly mode: PaymentProviderMode;
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor() {
    const mode = process.env.PAYMENT_PROVIDER_MODE as PaymentProviderMode || 'TEST';
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!keyId || !keySecret) {
      throw new Error(
        `[RazorpayProvider] Configuration error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required`
      );
    }

    if (mode === 'LIVE' && (!keyId.startsWith('rzp_live_'))) {
      throw new Error(
        `[RazorpayProvider] Configuration error: LIVE mode requires live keys (rzp_live_*)`
      );
    }

    if (mode === 'TEST' && (!keyId.startsWith('rzp_test_'))) {
      throw new Error(
        `[RazorpayProvider] Configuration error: TEST mode requires test keys (rzp_test_*)`
      );
    }

    this.mode = mode;
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret || '';

    // Safe startup logging
    console.log(JSON.stringify({
      level: 'info',
      service: 'razorpay',
      event: 'provider_initialized',
      mode: this.mode,
      keyId: this.keyId.substring(0, 12) + '***',
      webhookSecretConfigured: !!this.webhookSecret,
    }));
  }

  private getAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  private getBaseUrl(): string {
    return 'https://api.razorpay.com/v1';
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (this.mode === 'MOCK') {
      return {
        orderId: `order_mock_${randomBytes(12).toString('hex')}`,
        amount: input.amountInPaise,
        currency: input.currency,
        keyId: this.keyId,
      };
    }

    const response = await fetch(`${this.getBaseUrl()}/orders`, {
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
      keyId: this.keyId,
    };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    if (this.mode === 'MOCK') {
      return {
        subscriptionId: `sub_mock_${randomBytes(12).toString('hex')}`,
        shortUrl: `https://mock.razorpay.com/subscriptions/mock_${randomBytes(6).toString('hex')}`,
        status: 'active',
      };
    }

    const response = await fetch(`${this.getBaseUrl()}/subscriptions`, {
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

    const response = await fetch(`${this.getBaseUrl()}/subscriptions/${subscriptionId}/cancel`, {
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

  async fetchOrder(orderId: string): Promise<RazorpayOrder> {
    if (this.mode === 'MOCK') {
      return {
        id: orderId,
        entity: 'order',
        amount: 0,
        amount_paid: 0,
        amount_due: 0,
        currency: 'INR',
        receipt: '',
        offer_id: null,
        status: 'created',
        attempts: 0,
        notes: {},
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    const response = await fetch(`${this.getBaseUrl()}/orders/${orderId}`, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `[RazorpayProvider] Fetch order failed: ${data.error?.description || response.statusText}`
      );
    }

    return data as RazorpayOrder;
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    if (this.mode === 'MOCK') {
      return {
        id: paymentId,
        entity: 'payment',
        amount: 0,
        currency: 'INR',
        status: 'captured',
        order_id: '',
        invoice_id: null,
        international: false,
        method: 'card',
        amount_refunded: 0,
        refund_status: null,
        captured: true,
        description: null,
        card_id: null,
        bank: null,
        wallet: null,
        vpa: null,
        email: null,
        contact: null,
        notes: {},
        fee: 0,
        tax: 0,
        error_code: null,
        error_description: null,
        error_source: null,
        error_step: null,
        error_reason: null,
        acquirer_data: null,
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    const response = await fetch(`${this.getBaseUrl()}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: this.getAuthHeader(),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `[RazorpayProvider] Fetch payment failed: ${data.error?.description || response.statusText}`
      );
    }

    return data as RazorpayPayment;
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
   * Generates valid signature for mock/unit tests
   */
  generateTestPaymentSignature(orderId: string, paymentId: string, customSecret?: string): string {
    const secret = customSecret || this.keySecret;
    const payload = `${orderId}|${paymentId}`;
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Generates valid webhook signature for mock/unit tests
   */
  generateTestWebhookSignature(rawBody: string, customSecret?: string): string {
    const secret = customSecret || this.webhookSecret;
    return createHmac('sha256', secret).update(rawBody).digest('hex');
  }
}

export const razorpayProvider = new RazorpayProvider();
