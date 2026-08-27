import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '@leadguard/database';
import { razorpayProvider } from '../billing/razorpayProvider.js';
import { recordSecurityEvent } from '../auth.js';

export const DEFAULT_COMMERCIAL_PLANS = [
  {
    code: 'FREE',
    name: 'Starter Tier',
    description: 'Essential lead conversion and diagnostics for individual founders.',
    priceInPaise: 0,
    currency: 'INR',
    billingInterval: 'MONTHLY' as const,
    entitlements: {
      auditsPerMonth: 3,
      websites: 1,
      monitoring: false,
      apiAccess: false,
      whiteLabel: false,
      reports: 3,
      prospectLimit: 0,
    },
  },
  {
    code: 'PRO',
    name: 'Growth & Security Pro',
    description: 'High-frequency diagnostic scans and conversion leak detection for growing companies.',
    priceInPaise: 499900, // ₹4,999 / mo
    currency: 'INR',
    billingInterval: 'MONTHLY' as const,
    entitlements: {
      auditsPerMonth: 50,
      websites: 5,
      monitoring: true,
      apiAccess: true,
      whiteLabel: false,
      reports: 50,
      prospectLimit: 100,
    },
  },
  {
    code: 'AGENCY',
    name: 'Agency & Consultant Suite',
    description: 'Multi-client audits, client presentation reports, white-labeling, and audit queues.',
    priceInPaise: 1499900, // ₹14,999 / mo
    currency: 'INR',
    billingInterval: 'MONTHLY' as const,
    entitlements: {
      auditsPerMonth: 500,
      websites: 50,
      monitoring: true,
      apiAccess: true,
      whiteLabel: true,
      reports: 500,
      prospectLimit: 1000,
    },
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise Custom',
    description: 'Unlimited diagnostics, custom scanning concurrency, bespoke integrations & SLAs.',
    priceInPaise: 4999900, // ₹49,999 / mo
    currency: 'INR',
    billingInterval: 'MONTHLY' as const,
    entitlements: {
      auditsPerMonth: 99999,
      websites: 999,
      monitoring: true,
      apiAccess: true,
      whiteLabel: true,
      reports: 99999,
      prospectLimit: 10000,
    },
  },
  {
    code: 'WATCHDOG',
    name: 'LeadGuard Watchdog 24/7',
    description: 'Continuous uptime, form submission, and conversion leakage watchdog monitoring.',
    priceInPaise: 29900, // ₹299 / mo
    currency: 'INR',
    billingInterval: 'MONTHLY' as const,
    entitlements: {
      auditsPerMonth: 5,
      websites: 1,
      monitoring: true,
      apiAccess: false,
      whiteLabel: false,
      reports: 5,
      prospectLimit: 0,
    },
  },
];

// Valid Payment state transitions
const VALID_PAYMENT_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['AUTHORIZED', 'CAPTURED', 'FAILED'],
  AUTHORIZED: ['CAPTURED', 'FAILED'],
  CAPTURED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

// Valid Subscription state transitions
const VALID_SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['ACTIVE', 'FAILED'],
  ACTIVE: ['PAST_DUE', 'CANCELLED', 'PAUSED'],
  PAST_DUE: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: ['ACTIVE'],
  EXPIRED: [],
};

export class BillingService {
  async ensurePlansSeeded() {
    for (const plan of DEFAULT_COMMERCIAL_PLANS) {
      await db.plan.upsert({
        where: { code: plan.code },
        create: {
          code: plan.code,
          name: plan.name,
          description: plan.description,
          priceInPaise: plan.priceInPaise,
          currency: plan.currency,
          billingInterval: plan.billingInterval,
          entitlements: plan.entitlements,
        },
        update: {
          name: plan.name,
          description: plan.description,
          priceInPaise: plan.priceInPaise,
          entitlements: plan.entitlements,
        },
      });
    }
  }

  async listPlans() {
    await this.ensurePlansSeeded();
    return db.plan.findMany({
      where: { code: { not: 'WATCHDOG' } },
      orderBy: { priceInPaise: 'asc' },
    });
  }

  async getBillingOverview(organizationId: string) {
    await this.ensurePlansSeeded();
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!organization) return null;

    const currentSub = organization.subscriptions[0] || null;
    const plan = currentSub?.plan || (await db.plan.findUnique({ where: { code: 'FREE' } }));

    return {
      organizationId,
      currentPlan: plan,
      subscription: currentSub,
      recentPayments: organization.payments,
      recentInvoices: organization.invoices,
    };
  }

  /**
   * One-Time Express Fix Checkout (₹2,999 = 299900 paise) with Idempotency Key
   */
  async createExpressFixCheckout(
    organizationId: string,
    userId: string,
    websiteId: string,
    auditId?: string,
    idempotencyKey?: string
  ) {
    const amountInPaise = 299900; // Authoritative server-side price (₹2,999)

    // Idempotency: return existing order if same key was provided recently
    if (idempotencyKey) {
      const existingEvent = await db.billingEvent.findFirst({
        where: {
          organizationId,
          type: 'ORDER_CREATED',
          providerEventId: idempotencyKey,
        },
      });

      if (existingEvent && existingEvent.data) {
        const orderData = existingEvent.data as {
          orderId: string;
          amount: number;
          currency: string;
          keyId: string;
        };
        return {
          orderId: orderData.orderId,
          amount: orderData.amount,
          currency: orderData.currency,
          keyId: orderData.keyId,
          purpose: 'EXPRESS_FIX',
          reused: true,
        };
      }
    }

    const orderResult = await razorpayProvider.createOrder({
      amountInPaise,
      currency: 'INR',
      receipt: `ef_${Date.now()}`,
      notes: { organizationId, websiteId, userId, product: 'EXPRESS_FIX' },
    });

    await db.billingEvent.create({
      data: {
        organizationId,
        type: 'ORDER_CREATED',
        providerEventId: idempotencyKey || orderResult.orderId,
        data: {
          orderId: orderResult.orderId,
          amount: amountInPaise,
          currency: 'INR',
          keyId: orderResult.keyId,
          purpose: 'EXPRESS_FIX',
          websiteId,
          auditId,
        },
      },
    });

    return {
      orderId: orderResult.orderId,
      amount: amountInPaise,
      currency: 'INR',
      keyId: orderResult.keyId,
      purpose: 'EXPRESS_FIX',
    };
  }

  /**
   * Server-Side Verification for Express Fix
   */
  async verifyExpressFixPayment(
    organizationId: string,
    userId: string,
    input: {
      orderId: string;
      paymentId: string;
      signature: string;
      websiteId: string;
      auditId?: string;
    }
  ) {
    // 1. Verify cryptographic signature
    const isValid = razorpayProvider.verifyPaymentSignature({
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    });

    if (!isValid) {
      await recordSecurityEvent('SUSPICIOUS_PAYMENT_SIGNATURE', userId, null, {
        organizationId,
        orderId: input.orderId,
        paymentId: input.paymentId,
      });
      throw new Error('Invalid payment signature. Verification failed.');
    }

    // 2. Prevent duplicate payment processing (Idempotency)
    const existing = await db.payment.findUnique({
      where: { providerPaymentId: input.paymentId },
    });
    if (existing) {
      return { payment: existing, duplicate: true };
    }

    // 3. Create Payment & Invoice record
    const invoiceNumber = `INV-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const amountInPaise = 299900; // Authoritative price

    const [payment, invoice] = await db.$transaction([
      db.payment.create({
        data: {
          organizationId,
          provider: 'RAZORPAY',
          providerPaymentId: input.paymentId,
          providerOrderId: input.orderId,
          providerSignature: input.signature,
          amountInPaise,
          currency: 'INR',
          status: 'CAPTURED',
          purpose: 'EXPRESS_FIX',
          metadata: {
            websiteId: input.websiteId,
            auditId: input.auditId,
            verifiedAt: new Date().toISOString(),
          },
        },
      }),
      db.invoice.create({
        data: {
          organizationId,
          invoiceNumber,
          amountInPaise,
          currency: 'INR',
          status: 'PAID',
          paidAt: new Date(),
          billingAddress: { country: 'IN' },
          taxInfo: { gstin: null, taxType: 'GST_INCLUSIVE' },
        },
      }),
      db.billingEvent.create({
        data: {
          organizationId,
          type: 'PAYMENT_CAPTURED',
          providerEventId: input.paymentId,
          data: {
            amount: amountInPaise,
            purpose: 'EXPRESS_FIX',
            invoiceNumber,
          },
        },
      }),
    ]);

    return { payment, invoice, duplicate: false };
  }

  /**
   * Plan Subscription Checkout (Pro / Agency / Enterprise / Watchdog)
   */
  async createSubscriptionCheckout(
    organizationId: string,
    userId: string,
    planCode: string
  ) {
    await this.ensurePlansSeeded();
    const plan = await db.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new Error(`Plan ${planCode} not found`);

    const user = await db.user.findUnique({ where: { id: userId } });
    const subResult = await razorpayProvider.createSubscription({
      planId: plan.id,
      customerEmail: user?.email || 'customer@leadguard.test',
      notes: { organizationId, planCode },
    });

    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date(Date.now() + 30 * 86400000);

    // Create subscription record
    const subscription = await db.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: subResult.subscriptionId,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });

    await db.billingEvent.create({
      data: {
        organizationId,
        type: 'SUBSCRIPTION_CREATED',
        providerEventId: subResult.subscriptionId,
        data: { planCode, priceInPaise: plan.priceInPaise },
      },
    });

    return { subscription, plan, checkoutUrl: subResult.shortUrl };
  }

  /**
   * Cancel Active Subscription
   */
  async cancelSubscription(organizationId: string, userId: string) {
    const activeSub = await db.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
    });

    if (!activeSub) throw new Error('No active subscription found to cancel');

    await razorpayProvider.cancelSubscription(activeSub.providerSubscriptionId || '', false);

    const updated = await db.subscription.update({
      where: { id: activeSub.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        status: 'CANCELLED',
      },
    });

    await db.billingEvent.create({
      data: {
        organizationId,
        type: 'SUBSCRIPTION_CANCELLED',
        providerEventId: activeSub.providerSubscriptionId,
        data: { subscriptionId: activeSub.id },
      },
    });

    return updated;
  }

  /**
   * Validate Payment state transition
   */
  isValidPaymentTransition(from: string, to: string): boolean {
    const allowed = VALID_PAYMENT_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
  }

  /**
   * Validate Subscription state transition
   */
  isValidSubscriptionTransition(from: string, to: string): boolean {
    const allowed = VALID_SUBSCRIPTION_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
  }

  /**
   * Idempotent Webhook Handler for Razorpay
   */
  async handleRazorpayWebhook(
    rawBody: string,
    signature: string,
    eventPayload: Record<string, unknown>
  ) {
    // 1. Verify HMAC Webhook signature against raw bytes
    const isValid = razorpayProvider.verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isValid) {
      throw new Error('Invalid webhook signature');
    }

    const eventId = (eventPayload.id as string) || (eventPayload.event_id as string) || randomUUID();
    const eventType = (eventPayload.event as string) || 'unknown';

    // 2. Check Idempotency: Has event already been processed?
    const existingEvent = await db.billingEvent.findFirst({
      where: { providerEventId: eventId },
    });
    if (existingEvent) {
      return { received: true, duplicate: true };
    }

    // 3. Extract organizationId from payload notes if available
    const payloadData = (eventPayload.payload as Record<string, unknown>) || {};
    const paymentEntity = (payloadData.payment as { entity?: Record<string, unknown> })?.entity || {};
    const notes = (paymentEntity.notes as Record<string, string>) || {};
    const organizationId = notes.organizationId || null;

    // 4. Process event transactionally
    if (organizationId) {
      await db.billingEvent.create({
        data: {
          organizationId,
          type: eventType.toUpperCase().replace(/\./g, '_'),
          providerEventId: eventId,
          data: eventPayload as object,
        },
      });
    }

    return { received: true, duplicate: false };
  }
}

export const billingService = new BillingService();
