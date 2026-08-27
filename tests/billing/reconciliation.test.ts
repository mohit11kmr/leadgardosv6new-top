import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { billingReconciliationService } from '../../apps/api/src/services/billingReconciliationService.js';

describe('Billing: State Reconciliation Foundation (Requirement 23, 35)', () => {
  it('detects subscription and payment anomalies during reconciliation scans', async () => {
    const org = await db.organization.create({
      data: { name: 'Recon Org', slug: `recon-org-${Date.now()}` },
    });

    const plan = await db.plan.findUnique({ where: { code: 'PRO' } });

    // Create a subscription with invalid provider ID structure to trigger anomaly
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan!.id,
        status: 'ACTIVE',
        providerSubscriptionId: `invalid_prefix_${Date.now()}`,
      },
    });

    const subRecon = await billingReconciliationService.reconcileSubscriptions(org.id);
    expect(subRecon.checked).toBeGreaterThanOrEqual(1);
    expect(subRecon.discrepancies.length).toBeGreaterThanOrEqual(1);
    expect(subRecon.discrepancies[0]?.field).toBe('providerSubscriptionId');

    // Create an invalid 0 amount captured payment
    await db.payment.create({
      data: {
        organizationId: org.id,
        provider: 'RAZORPAY',
        providerPaymentId: `pay_anomaly_${Date.now()}`,
        amountInPaise: 0,
        currency: 'INR',
        status: 'CAPTURED',
        purpose: 'EXPRESS_FIX',
      },
    });

    const pmtRecon = await billingReconciliationService.reconcilePayments(org.id);
    expect(pmtRecon.discrepancies.some((d) => d.field === 'amountInPaise')).toBe(true);
  });
});
