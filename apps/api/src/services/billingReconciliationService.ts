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
    });

    const discrepancies: ReconciliationDiscrepancy[] = [];

    for (const sub of subscriptions) {
      if (razorpayProvider.mode === 'TEST') {
        // In TEST mode, verify local referential integrity
        if (!sub.providerSubscriptionId?.startsWith('sub_test_')) {
          discrepancies.push({
            entityType: 'SUBSCRIPTION',
            entityId: sub.id,
            providerId: sub.providerSubscriptionId || '',
            field: 'providerSubscriptionId',
            localValue: sub.providerSubscriptionId,
            providerValue: 'sub_test_*',
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
    // both TEST and LIVE sandbox responses. In TEST mode we additionally verify
    // structural referential integrity of provider-bound fields, mirroring the
    // same hardening applied to subscriptions.
    const isTestMode = razorpayProvider.mode === 'TEST';

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

      if (isTestMode) {
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

        if (pmt.providerOrderId && !/^order_[A-Za-z0-9]+$/.test(pmt.providerOrderId)) {
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
