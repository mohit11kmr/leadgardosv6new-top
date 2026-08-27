import { apiClient } from './client.js';

export interface PlanEntitlements {
  auditsPerMonth: number;
  websites: number;
  monitoring: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  reports: number;
  prospectLimit: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description?: string;
  priceInPaise: number;
  currency: string;
  billingInterval: string;
  entitlements: PlanEntitlements;
}

export interface Subscription {
  id: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED' | 'EXPIRED';
  currentPeriodStart: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
}

export interface Payment {
  id: string;
  providerPaymentId: string;
  amountInPaise: number;
  currency: string;
  status: string;
  purpose: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amountInPaise: number;
  currency: string;
  status: string;
  paidAt?: string;
  createdAt: string;
}

export interface BillingOverview {
  organizationId: string;
  currentPlan: Plan;
  subscription: Subscription | null;
  recentPayments: Payment[];
  recentInvoices: Invoice[];
}

export interface EntitlementsOverview {
  plan: {
    id: string;
    code: string;
    name: string;
    priceInPaise: number;
    currency: string;
  };
  subscription: Subscription | null;
  entitlements: PlanEntitlements;
  usage: {
    audits: { used: number; limit: number; remaining: number };
    websites: { used: number; limit: number; remaining: number };
  };
}

export async function getBillingOverview(): Promise<BillingOverview> {
  return apiClient<BillingOverview>('/billing');
}

export async function getPlans(): Promise<Plan[]> {
  return apiClient<Plan[]>('/billing/plans');
}

export async function getEntitlements(): Promise<EntitlementsOverview> {
  return apiClient<EntitlementsOverview>('/billing/entitlements');
}

export async function createExpressFixCheckout(
  websiteId: string,
  auditId?: string
): Promise<{ orderId: string; amount: number; currency: string; keyId: string }> {
  return apiClient('/billing/checkout/express-fix', {
    method: 'POST',
    body: JSON.stringify({ websiteId, auditId }),
  });
}

export async function verifyExpressFixPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
  websiteId: string;
  auditId?: string;
}): Promise<{ payment: Payment; invoice: Invoice }> {
  return apiClient('/billing/checkout/express-fix/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createSubscriptionCheckout(
  planCode: string
): Promise<{ subscription: Subscription; plan: Plan; checkoutUrl?: string }> {
  return apiClient('/billing/checkout/subscription', {
    method: 'POST',
    body: JSON.stringify({ planCode }),
  });
}

export async function cancelSubscription(): Promise<Subscription> {
  return apiClient<Subscription>('/billing/subscription/cancel', {
    method: 'POST',
  });
}

export async function getPayments(): Promise<Payment[]> {
  return apiClient<Payment[]>('/billing/payments');
}

export async function getInvoices(): Promise<Invoice[]> {
  return apiClient<Invoice[]>('/billing/invoices');
}
