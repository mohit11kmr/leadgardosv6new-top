export interface CreateOrderInput {
  amountInPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface CreateSubscriptionInput {
  planId: string;
  customerEmail: string;
  customerName?: string;
  totalCount?: number;
  notes?: Record<string, string>;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  shortUrl?: string;
  status: string;
}

export interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyWebhookInput {
  rawBody: string;
  signature: string;
  webhookSecret?: string;
}

export interface PaymentProvider {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  cancelSubscription(subscriptionId: string, cancelImmediately?: boolean): Promise<{ cancelled: boolean }>;
  verifyPaymentSignature(input: VerifyPaymentInput): boolean;
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
}
