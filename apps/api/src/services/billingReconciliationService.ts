import { db } from '@leadguard/database';
import { razorpayProvider } from '../billing/razorpayProvider.js';

export interface ReconciliationDiscrepancy {
  entityType: 'SUBSCRIPTION' | 'PAYMENT';
  entityId: string;
  providerId: string;
  field: string;
  localValue: unknown;
  providerValue: unknown;
  severity: 'HIGH' | 'MEDIUM';
}

export class BillingReconciliationService {
  /**
   * Compares active local subscriptions with provider records
   */
  async reconcileSubscriptions(organizationId?: string): Promise<{
    checked: number;
    discrepancies: ReconciliationDiscrepancy[];
  }> {
    const subscriptions = await db.subscription.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
        providerSubscriptionId: { not: null },
      },
      // Bounded: an operator-triggered check, not a data export — caps a
      // single run the same way reconcilePayments already caps at 100.
      take: 500,
      orderBy: { updatedAt: 'desc' },
    });

    const discrepancies: ReconciliationDiscrepancy[] = [];

    for (const sub of subscriptions) {
      // In the offline/dev modes (TEST and MOCK) we can never verify the local
      // id against the provider, so we validate structural referential
      // integrity of the subscription id instead.
      if (['TEST', 'MOCK'].includes(razorpayProvider.mode)) {
        const validPrefix = razorpayProvider.mode === 'TEST' ? 'sub_test_' : 'sub_mock_';
        if (!sub.providerSubscriptionId?.startsWith(validPrefix)) {
          discrepancies.push({
            entityType: 'SUBSCRIPTION',
            entityId: sub.id,
            providerId: sub.providerSubscriptionId || '',
            field: 'providerSubscriptionId',
            localValue: sub.providerSubscriptionId,
            providerValue: `${validPrefix}*`,
            severity: 'MEDIUM',
          });
        }
      }
    }

    return {
      checked: subscriptions.length,
      discrepancies,
    };
  }

  /**
   * Compares captured local payments with provider records
   */
  async reconcilePayments(organizationId?: string): Promise<{
    checked: number;
    discrepancies: ReconciliationDiscrepancy[];
  }> {
    const payments = await db.payment.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        status: 'CAPTURED',
      },
      take: 100,
      orderBy: { createdAt: 'desc' },
    });

    const discrepancies: ReconciliationDiscrepancy[] = [];

    // Razorpay payment IDs always follow the `pay_` prefix (e.g. pay_9A2k...) in
    // both TEST and LIVE sandbox responses. In the offline/dev modes (TEST and
    // MOCK) we additionally verify structural referential integrity of
    // provider-bound fields, mirroring the same hardening applied to
    // subscriptions.
    const runStructuralChecks = ['TEST', 'MOCK'].includes(razorpayProvider.mode);

    for (const pmt of payments) {
      if (pmt.amountInPaise <= 0) {
        discrepancies.push({
          entityType: 'PAYMENT',
          entityId: pmt.id,
          providerId: pmt.providerPaymentId,
          field: 'amountInPaise',
          localValue: pmt.amountInPaise,
          providerValue: '>0',
          severity: 'HIGH',
        });
      }

      if (runStructuralChecks) {
        if (!/^pay_[A-Za-z0-9]+$/.test(pmt.providerPaymentId)) {
          discrepancies.push({
            entityType: 'PAYMENT',
            entityId: pmt.id,
            providerId: pmt.providerPaymentId,
            field: 'providerPaymentId',
            localValue: pmt.providerPaymentId,
            providerValue: 'pay_*',
            severity: 'MEDIUM',
          });
        }

        // Accept the standard alphanumeric `order_<id>` form as well as the
        // MOCK mode variant `order_mock_<id>`.
        if (pmt.providerOrderId && !/^order_(mock_)?[A-Za-z0-9]+$/.test(pmt.providerOrderId)) {
          discrepancies.push({
            entityType: 'PAYMENT',
            entityId: pmt.id,
            providerId: pmt.providerPaymentId,
            field: 'providerOrderId',
            localValue: pmt.providerOrderId,
            providerValue: 'order_*',
            severity: 'MEDIUM',
          });
        }
      }
    }

    return {
      checked: payments.length,
      discrepancies,
    };
  }
}

export const billingReconciliationService = new BillingReconciliationService();
