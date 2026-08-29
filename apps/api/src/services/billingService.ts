import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '@leadguard/database';
import { razorpayProvider } from '../billing/razorpayProvider.js';
import { recordSecurityEvent } from '../auth.js';
import { systemGuestOrganizationService } from './systemGuestOrganizationService.js';

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

    // Create fulfillment record
    await this.createExpressFixFulfillment(
      organizationId,
      input.websiteId,
      input.auditId,
      input.paymentId
    );

    // Update fulfillment status to PAID
    await this.updateExpressFixFulfillment(input.paymentId, 'PAID');

    return { payment, invoice, duplicate: false };
  }

  /**
   * Plan Subscription Checkout (Pro / Agency / Enterprise / Watchdog)
   * Creates subscription in CREATED status - will be activated via webhook after provider confirmation
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

    // Create subscription record in CREATED status - will be activated via webhook
    const subscription = await db.subscription.create({
      data: {
        organizationId,
        planId: plan.id,
        status: 'CREATED',
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
   * Activate subscription after provider confirmation (called from webhook)
   */
  async activateSubscription(organizationId: string, providerSubscriptionId: string) {
    const subscription = await db.subscription.findFirst({
      where: { organizationId, providerSubscriptionId, status: 'CREATED' },
    });

    if (!subscription) {
      return null;
    }

    if (!this.isValidSubscriptionTransition(subscription.status, 'ACTIVE')) {
      throw new Error(`Invalid subscription transition from ${subscription.status} to ACTIVE`);
    }

    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      },
    });

    await db.billingEvent.create({
      data: {
        organizationId,
        type: 'SUBSCRIPTION_ACTIVATED',
        providerEventId: providerSubscriptionId,
        data: { subscriptionId: subscription.id },
      },
    });

    return updated;
  }

  /**
   * Handle subscription payment failure
   */
  async failSubscription(organizationId: string, providerSubscriptionId: string, reason?: string) {
    const subscription = await db.subscription.findFirst({
      where: { organizationId, providerSubscriptionId, status: 'CREATED' },
    });

    if (!subscription) {
      return null;
    }

    const updated = await db.subscription.update({
      where: { id: subscription.id },
      data: { status: 'FAILED' },
    });

    await db.billingEvent.create({
      data: {
        organizationId,
        type: 'SUBSCRIPTION_FAILED',
        providerEventId: providerSubscriptionId,
        data: { subscriptionId: subscription.id, reason },
      },
    });

    return updated;
  }

  /**
   * Create Express Fix fulfillment record after successful payment
   */
  async createExpressFixFulfillment(
    organizationId: string,
    websiteId: string,
    auditId: string | undefined,
    paymentId: string
  ) {
    const fulfillment = await db.expressFixFulfillment.create({
      data: {
        organizationId,
        websiteId,
        auditId,
        paymentId,
        status: 'PAYMENT_PENDING',
      },
    });

    await db.billingEvent.create({
      data: {
        organizationId,
        type: 'EXPRESS_FIX_FULFILLMENT_CREATED',
        providerEventId: paymentId,
        data: { fulfillmentId: fulfillment.id, websiteId, auditId },
      },
    });

    return fulfillment;
  }

  /**
   * Update Express Fix fulfillment status
   */
  async updateExpressFixFulfillment(
    paymentId: string,
    status: 'PAYMENT_PENDING' | 'PAID' | 'FULFILLMENT_PENDING' | 'FULFILLMENT_IN_PROGRESS' | 'FULFILLED' | 'FULFILLMENT_FAILED',
    notes?: string
  ) {
    const fulfillment = await db.expressFixFulfillment.findUnique({
      where: { paymentId },
    });

    if (!fulfillment) {
      return null;
    }

    const updated = await db.expressFixFulfillment.update({
      where: { paymentId },
      data: {
        status,
        notes,
        ...(status === 'FULFILLED' ? { completedAt: new Date() } : {}),
      },
    });

    await db.billingEvent.create({
      data: {
        organizationId: fulfillment.organizationId,
        type: 'EXPRESS_FIX_FULFILLMENT_UPDATED',
        providerEventId: paymentId,
        data: { fulfillmentId: fulfillment.id, status, notes },
      },
    });

    return updated;
  }

  /**
   * Get Express Fix fulfillment status
   */
  async getExpressFixFulfillment(paymentId: string) {
    return db.expressFixFulfillment.findUnique({
      where: { paymentId },
      include: {
        website: { select: { id: true, domain: true, url: true } },
        audit: { select: { id: true, status: true, createdAt: true } },
        payment: { select: { id: true, amountInPaise: true, currency: true, createdAt: true } },
      },
    });
  }

  /**
   * Guest Express Fix Checkout - creates order for guest scans
   * Uses the system guest organization for billing
   */
  async createGuestExpressFixCheckout(
    websiteId: string,
    auditId: string,
    customerEmail: string,
    customerName?: string
  ) {
    const amountInPaise = 299900; // Authoritative server-side price (₹2,999)
    const systemGuestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();

    // Idempotency: check if there's an existing order for this audit
    const existingEvent = await db.billingEvent.findFirst({
      where: {
        organizationId: systemGuestOrgId,
        type: 'ORDER_CREATED',
        data: {
          path: ['auditId'],
          equals: auditId,
        },
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

    const orderResult = await razorpayProvider.createOrder({
      amountInPaise,
      currency: 'INR',
      receipt: `gef_${Date.now()}`,
      notes: {
        organizationId: systemGuestOrgId,
        websiteId,
        auditId,
        customerEmail,
        customerName: customerName || '',
        product: 'EXPRESS_FIX_GUEST',
      },
    });

    await db.billingEvent.create({
      data: {
        organizationId: systemGuestOrgId,
        type: 'ORDER_CREATED',
        providerEventId: orderResult.orderId,
        data: {
          orderId: orderResult.orderId,
          amount: amountInPaise,
          currency: 'INR',
          keyId: orderResult.keyId,
          purpose: 'EXPRESS_FIX',
          websiteId,
          auditId,
          customerEmail,
          customerName: customerName || '',
        },
      },
    });

    console.log(JSON.stringify({
      level: 'info',
      service: 'billing',
      event: 'express_fix_order_created',
      orderId: orderResult.orderId,
      auditId,
      websiteId,
      organizationId: systemGuestOrgId,
      amount: amountInPaise,
      currency: 'INR',
    }));

    return {
      orderId: orderResult.orderId,
      amount: amountInPaise,
      currency: 'INR',
      keyId: orderResult.keyId,
      purpose: 'EXPRESS_FIX',
    };
  }

  /**
   * Guest Express Fix Payment Verification
   * Verifies payment for guest scans using system guest organization
   * Includes provider-side verification via Razorpay API
   */
  async verifyGuestExpressFixPayment(
    orderId: string,
    paymentId: string,
    signature: string,
    websiteId: string,
    auditId: string
  ) {
    console.log(JSON.stringify({
      level: 'info',
      service: 'billing',
      event: 'express_fix_payment_verification_started',
      orderId,
      paymentId,
      auditId,
      websiteId,
    }));

    // 1. Verify cryptographic signature
    const isValid = razorpayProvider.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValid) {
      await recordSecurityEvent('SUSPICIOUS_PAYMENT_SIGNATURE', null, null, {
        orderId,
        paymentId,
      });
      throw new Error('Invalid payment signature. Verification failed.');
    }

    // 2. Verify the order belongs to a guest scan
    const billingEvent = await db.billingEvent.findFirst({
      where: {
        type: 'ORDER_CREATED',
        providerEventId: orderId,
        data: {
          path: ['auditId'],
          equals: auditId,
        },
      },
    });

    if (!billingEvent) {
      throw new Error('Order not found or does not match guest scan');
    }

    const systemGuestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();

    // 3. Verify order binding and amount from stored billing event
    const orderData = billingEvent.data as {
      orderId: string;
      amount: number;
      currency: string;
      websiteId: string;
      auditId: string;
      customerEmail?: string;
      customerName?: string;
    };

    if (orderData.orderId !== orderId) {
      throw new Error('Order ID mismatch');
    }
    if (orderData.amount !== 299900) {
      throw new Error('Amount mismatch');
    }
    if (orderData.currency !== 'INR') {
      throw new Error('Currency mismatch');
    }
    if (orderData.websiteId !== websiteId) {
      throw new Error('Website ID mismatch');
    }
    if (orderData.auditId !== auditId) {
      throw new Error('Audit ID mismatch');
    }

    // 4. Provider-side verification: Fetch order and payment from Razorpay
    let razorpayOrder: any;
    let razorpayPayment: any;
    try {
      razorpayOrder = await razorpayProvider.fetchOrder(orderId);
      razorpayPayment = await razorpayProvider.fetchPayment(paymentId);
    } catch (error) {
      await recordSecurityEvent('RAZORPAY_PROVIDER_VERIFICATION_FAILED', null, null, {
        orderId,
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Provider verification failed. Unable to verify payment with Razorpay.');
    }

    // 5. Verify provider order details match
    if (razorpayOrder.id !== orderId) {
      throw new Error('Provider order ID mismatch');
    }
    if (razorpayOrder.amount !== 299900) {
      throw new Error('Provider order amount mismatch');
    }
    if (razorpayOrder.currency !== 'INR') {
      throw new Error('Provider order currency mismatch');
    }
    if (razorpayOrder.status !== 'paid' && razorpayOrder.status !== 'attempted') {
      console.log(JSON.stringify({
        level: 'warn',
        service: 'billing',
        event: 'express_fix_payment_rejected',
        reason: 'provider_order_not_payable',
        orderId,
        paymentId,
        auditId,
        websiteId,
      }));
      throw new Error('Payment could not be verified. No order was fulfilled.');
    }

    // 6. Verify provider payment details match
    if (razorpayPayment.id !== paymentId) {
      throw new Error('Provider payment ID mismatch');
    }
    if (razorpayPayment.order_id !== orderId) {
      throw new Error('Provider payment does not belong to this order');
    }
    if (razorpayPayment.amount !== 299900) {
      throw new Error('Provider payment amount mismatch');
    }
    if (razorpayPayment.currency !== 'INR') {
      throw new Error('Provider payment currency mismatch');
    }
    if (!razorpayPayment.captured) {
      console.log(JSON.stringify({
        level: 'warn',
        service: 'billing',
        event: 'express_fix_payment_rejected',
        reason: 'provider_payment_not_captured',
        orderId,
        paymentId,
        auditId,
        websiteId,
      }));
      throw new Error('Payment could not be verified. No order was fulfilled.');
    }

    // 7. Verify stored order binding and amount
    if (orderData.orderId !== orderId) {
      throw new Error('Order ID mismatch');
    }
    if (orderData.amount !== 299900) {
      throw new Error('Amount mismatch');
    }
    if (orderData.currency !== 'INR') {
      throw new Error('Currency mismatch');
    }
    if (orderData.websiteId !== websiteId) {
      throw new Error('Website ID mismatch');
    }
    if (orderData.auditId !== auditId) {
      throw new Error('Audit ID mismatch');
    }

    // 8. Prevent duplicate payment processing (Idempotency)
    const existing = await db.payment.findUnique({
      where: { providerPaymentId: paymentId },
    });
    if (existing) {
      return { payment: existing, duplicate: true };
    }

    // 9. Create Payment & Invoice record with proper state machine
    const invoiceNumber = `INV-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const amountInPaise = 299900; // Authoritative price

    const [payment, invoice] = await db.$transaction([
      db.payment.create({
        data: {
          organizationId: systemGuestOrgId,
          provider: 'RAZORPAY',
          providerPaymentId: paymentId,
          providerOrderId: orderId,
          providerSignature: signature,
          amountInPaise,
          currency: 'INR',
          status: 'CAPTURED',
          purpose: 'EXPRESS_FIX',
          metadata: {
            websiteId,
            auditId,
            customerEmail: orderData.customerEmail,
            customerName: orderData.customerName,
            verifiedAt: new Date().toISOString(),
            providerPaymentStatus: razorpayPayment.status,
            providerOrderStatus: razorpayOrder.status,
          },
        },
      }),
      db.invoice.create({
        data: {
          organizationId: systemGuestOrgId,
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
          organizationId: systemGuestOrgId,
          type: 'PAYMENT_CAPTURED',
          providerEventId: paymentId,
          data: {
            amount: amountInPaise,
            purpose: 'EXPRESS_FIX',
            invoiceNumber,
            websiteId,
            auditId,
            customerEmail: orderData.customerEmail,
            customerName: orderData.customerName,
            providerOrderId: razorpayOrder.id,
            providerPaymentId: razorpayPayment.id,
          },
        },
      }),
    ]);

    // 10. Create fulfillment record
    await this.createExpressFixFulfillment(
      systemGuestOrgId,
      websiteId,
      auditId,
      paymentId
    );

    // 11. Update fulfillment status to PAID (fulfillment pending)
    await this.updateExpressFixFulfillment(paymentId, 'FULFILLMENT_PENDING');

    // Log successful verification
    console.log(JSON.stringify({
      level: 'info',
      service: 'billing',
      event: 'express_fix_payment_verified',
      orderId,
      paymentId,
      auditId,
      websiteId,
      organizationId: systemGuestOrgId,
    }));

    return { payment, invoice, duplicate: false };
  }

  /**
   * Get Express Fix fulfillment status for public access (by fulfillment ID)
   */
  async getExpressFixFulfillmentStatus(fulfillmentId: string) {
    const fulfillment = await db.expressFixFulfillment.findUnique({
      where: { id: fulfillmentId },
      include: {
        website: { select: { id: true, domain: true, url: true } },
        audit: { select: { id: true, status: true, createdAt: true } },
        payment: { select: { id: true, amountInPaise: true, currency: true, createdAt: true } },
      },
    });

    if (!fulfillment) {
      return null;
    }

    // Return safe public data only
    return {
      id: fulfillment.id,
      status: fulfillment.status,
      website: {
        domain: fulfillment.website.domain,
        url: fulfillment.website.url,
      },
      audit: {
        id: fulfillment.audit?.id,
        status: fulfillment.audit?.status,
        createdAt: fulfillment.audit?.createdAt,
      },
      payment: {
        amount: fulfillment.payment?.amountInPaise,
        currency: fulfillment.payment?.currency,
        createdAt: fulfillment.payment?.createdAt,
      },
      createdAt: fulfillment.createdAt,
      updatedAt: fulfillment.updatedAt,
    };
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
  ): Promise<{ received: boolean; duplicate: boolean }> {
    // 1. Verify HMAC Webhook signature against raw bytes
    const isValid = razorpayProvider.verifyWebhookSignature({
      rawBody,
      signature,
    });

    if (!isValid) {
      await recordSecurityEvent('RAZORPAY_WEBHOOK_INVALID_SIGNATURE', null, null, {
        eventType: (eventPayload.event as string) || 'unknown',
      });
      throw new Error('Invalid webhook signature');
    }

    const eventId = (eventPayload.id as string) || (eventPayload.event_id as string) || randomUUID();
    const eventType = (eventPayload.event as string) || 'unknown';

    // 2. Check Idempotency: Has event already been processed?
    const existingEvent = await db.billingEvent.findFirst({
      where: { providerEventId: eventId },
    });
    if (existingEvent) {
      console.log(JSON.stringify({
        level: 'info',
        service: 'billing',
        event: 'razorpay_webhook_duplicate',
        eventId,
        eventType,
      }));
      return { received: true, duplicate: true };
    }

    // 3. Extract organizationId from payload notes if available
    const payloadData = (eventPayload.payload as Record<string, unknown>) || {};
    const paymentEntity = (payloadData.payment as { entity?: Record<string, unknown> })?.entity || {};
    const subscriptionEntity = (payloadData.subscription as { entity?: Record<string, unknown> })?.entity || {};
    const paymentNotes = (paymentEntity.notes as Record<string, string>) || {};
    const subscriptionNotes = (subscriptionEntity.notes as Record<string, string>) || {};
    const notes = { ...paymentNotes, ...subscriptionNotes };
    const organizationId = (notes.organizationId as string) || null;

    // Log webhook received
    console.log(JSON.stringify({
      level: 'info',
      service: 'billing',
      event: 'razorpay_webhook_received',
      eventId,
      eventType,
      organizationId,
    }));

    // 4. Process event based on type
    if (organizationId) {
      await db.$transaction(async (tx) => {
        await this.processWebhookTransaction(
          tx,
          organizationId,
          eventId,
          eventType,
          eventPayload,
          payloadData,
          paymentEntity,
          subscriptionEntity,
          paymentNotes
        );
      });
    }

    return { received: true, duplicate: false };
  }

  /**
   * Process webhook transaction logic in a separate method to avoid TypeScript closure issues
   */
  private async processWebhookTransaction(
    tx: any,
    organizationId: string,
    eventId: string,
    eventType: string,
    eventPayload: Record<string, unknown>,
    payloadData: Record<string, unknown>,
    paymentEntity: Record<string, unknown>,
    subscriptionEntity: Record<string, unknown>,
    paymentNotes: Record<string, string>
  ): Promise<void> {
    await tx.billingEvent.create({
      data: {
        organizationId,
        type: eventType.toUpperCase().replace(/\./g, '_'),
        providerEventId: eventId,
        data: eventPayload as object,
      },
    });

    const paymentEntityTyped = paymentEntity as Record<string, any>;
    const subscriptionEntityTyped = subscriptionEntity as Record<string, any>;

    // Handle subscription activation
    if (eventType === 'subscription.charged' || eventType === 'subscription.activated') {
      const providerSubscriptionId = subscriptionEntityTyped.id as string;
      if (providerSubscriptionId) {
        const subscription = await tx.subscription.findFirst({
          where: { organizationId, providerSubscriptionId, status: 'CREATED' },
        });
        if (subscription && this.isValidSubscriptionTransition(subscription.status, 'ACTIVE')) {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
            },
          });
          await tx.billingEvent.create({
            data: {
              organizationId,
              type: 'SUBSCRIPTION_ACTIVATED',
              providerEventId: providerSubscriptionId,
              data: { subscriptionId: subscription.id },
            },
          });
        }
      }
    }

    // Handle subscription payment failure
    if (eventType === 'subscription.charge_failed' || eventType === 'subscription.paused') {
      const providerSubscriptionId = subscriptionEntityTyped.id as string;
      if (providerSubscriptionId) {
        const subscription = await tx.subscription.findFirst({
          where: { organizationId, providerSubscriptionId, status: { in: ['CREATED', 'ACTIVE'] } },
        });
        if (subscription) {
          await tx.subscription.update({
            where: { id: subscription.id },
            data: { status: 'PAST_DUE' },
          });
          await tx.billingEvent.create({
            data: {
              organizationId,
              type: 'SUBSCRIPTION_PAYMENT_FAILED',
              providerEventId: providerSubscriptionId,
              data: { subscriptionId: subscription.id },
            },
          });
        }
      }
    }

    // Handle Express Fix fulfillment updates - payment.captured
    if (eventType === 'payment.captured') {
      const paymentId = paymentEntityTyped.id as string;
      const paymentAmount = paymentEntityTyped.amount as number;
      const paymentCurrency = paymentEntityTyped.currency as string;

      if (paymentId) {
        console.log(JSON.stringify({
          level: 'info',
          service: 'billing',
          event: 'razorpay_webhook_payment_captured',
          eventId,
          paymentId,
          amount: paymentAmount,
          currency: paymentCurrency,
          organizationId,
        }));

        // Reconcile the payment record with the provider-confirmed captured state
        const existingPayment = await tx.payment.findUnique({
          where: { providerPaymentId: paymentId },
        });
        if (existingPayment && existingPayment.status !== 'CAPTURED') {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: { status: 'CAPTURED' },
          });
        }

        // Handle Express Fix fulfillment
        if (paymentNotes.purpose === 'EXPRESS_FIX') {
          const fulfillment = await tx.expressFixFulfillment.findUnique({
            where: { paymentId },
          });
          if (fulfillment) {
            if (fulfillment.status === 'PAYMENT_PENDING' || fulfillment.status === 'FULFILLMENT_PENDING') {
              await tx.expressFixFulfillment.update({
                where: { paymentId },
                data: { status: 'FULFILLMENT_IN_PROGRESS' },
              });
              await tx.billingEvent.create({
                data: {
                  organizationId,
                  type: 'EXPRESS_FIX_FULFILLMENT_IN_PROGRESS',
                  providerEventId: paymentId,
                  data: { fulfillmentId: fulfillment.id },
                },
              });
            }
          }
        }
      }
    }

    // Handle Express Fix fulfillment updates - payment.failed
    if (eventType === 'payment.failed') {
      const paymentId = paymentEntityTyped.id as string;
      const errorCode = paymentEntityTyped.error_code as string | undefined;
      const errorDescription = paymentEntityTyped.error_description as string | undefined;

      if (paymentId) {
        console.log(JSON.stringify({
          level: 'warn',
          service: 'billing',
          event: 'razorpay_webhook_payment_failed',
          eventId,
          paymentId,
          errorCode,
          errorDescription,
          organizationId,
        }));

        const existingPayment = await tx.payment.findUnique({
          where: { providerPaymentId: paymentId },
        });
        if (existingPayment && existingPayment.status !== 'FAILED') {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: { status: 'FAILED' },
          });
        }

        // Handle Express Fix fulfillment
        if (paymentNotes.purpose === 'EXPRESS_FIX') {
          const fulfillment = await tx.expressFixFulfillment.findUnique({
            where: { paymentId },
          });
          if (fulfillment) {
            await tx.expressFixFulfillment.update({
              where: { paymentId },
              data: {
                status: 'FULFILLMENT_FAILED',
                notes: `Payment failed: ${errorDescription || errorCode || 'Unknown error'}`,
              },
            });
            await tx.billingEvent.create({
              data: {
                organizationId,
                type: 'EXPRESS_FIX_FULFILLMENT_FAILED',
                providerEventId: paymentId,
                data: {
                  fulfillmentId: fulfillment.id,
                  errorCode,
                  errorDescription,
                },
              },
            });
          }
        }
      }
    }

    // Handle order.paid (alternative event for order completion)
    if (eventType === 'order.paid') {
      const orderEntity = (payloadData.order as { entity?: Record<string, unknown> })?.entity || {};
      const orderId = orderEntity.id as string;
      const orderAmount = orderEntity.amount as number;
      const orderCurrency = orderEntity.currency as string;

      console.log(JSON.stringify({
        level: 'info',
        service: 'billing',
        event: 'razorpay_webhook_order_paid',
        eventId,
        orderId,
        amount: orderAmount,
        currency: orderCurrency,
        organizationId,
      }));
    }
  }
}

export const billingService = new BillingService();
