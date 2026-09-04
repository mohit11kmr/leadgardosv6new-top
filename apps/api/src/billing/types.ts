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

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  offer_id: string | null;
  status: string;
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpayPayment {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id: string;
  invoice_id: string | null;
  international: boolean;
  method: string | null;
  amount_refunded: number;
  refund_status: string | null;
  captured: boolean;
  description: string | null;
  card_id: string | null;
  bank: string | null;
  wallet: string | null;
  vpa: string | null;
  email: string | null;
  contact: string | null;
  notes: Record<string, string>;
  fee: number;
  tax: number;
  error_code: string | null;
  error_description: string | null;
  error_source: string | null;
  error_step: string | null;
  error_reason: string | null;
  acquirer_data: Record<string, unknown> | null;
  created_at: number;
}

export interface CreateRefundInput {
  paymentId: string;
  amountInPaise: number;
  /** Client-supplied idempotency key so a retried call never creates two provider-side refunds. Razorpay accepts this via the request's Idempotency-Key header. */
  idempotencyKey: string;
  notes?: Record<string, string>;
}

export interface RazorpayRefund {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  payment_id: string;
  status: string;
  created_at: number;
}

export interface PaymentProvider {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  cancelSubscription(subscriptionId: string, cancelImmediately?: boolean): Promise<{ cancelled: boolean }>;
  verifyPaymentSignature(input: VerifyPaymentInput): boolean;
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
  fetchOrder(orderId: string): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  refundPayment(input: CreateRefundInput): Promise<RazorpayRefund>;
}
