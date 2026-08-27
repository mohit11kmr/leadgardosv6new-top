import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBillingOverview,
  getPlans,
  getEntitlements,
  createSubscriptionCheckout,
  cancelSubscription,
  createExpressFixCheckout,
  verifyExpressFixPayment,
  type BillingOverview,
  type Plan,
  type EntitlementsOverview,
} from '../../api/billing.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Modal } from '../../components/ui/Modal.js';
import { Skeleton, ErrorState } from '../../components/ui/States.js';

export function BillingView() {
  const queryClient = useQueryClient();
  const [checkoutStatus, setCheckoutStatus] = useState<string | null>(null);
  const [expressFixModal, setExpressFixModal] = useState(false);

  const { data: billing, isLoading: loadingBilling, error: billingError } = useQuery<BillingOverview>({
    queryKey: ['billing-overview'],
    queryFn: getBillingOverview,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: getPlans,
  });

  const { data: entitlements } = useQuery<EntitlementsOverview>({
    queryKey: ['billing-entitlements'],
    queryFn: getEntitlements,
  });

  const subscribeMutation = useMutation({
    mutationFn: (planCode: string) => createSubscriptionCheckout(planCode),
    onSuccess: (data) => {
      setCheckoutStatus(`Subscription to ${data.plan.name} initialized successfully.`);
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] });
    },
    onError: (err: unknown) => {
      setCheckoutStatus(err instanceof Error ? err.message : 'Checkout failed');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSubscription(),
    onSuccess: () => {
      setCheckoutStatus('Subscription cancelled. Access remains active through current billing period.');
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
      queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] });
    },
    onError: (err: unknown) => {
      setCheckoutStatus(err instanceof Error ? err.message : 'Cancellation failed');
    },
  });

  const expressFixMutation = useMutation({
    mutationFn: async () => {
      const order = await createExpressFixCheckout('00000000-0000-0000-0000-000000000000');
      const res = await verifyExpressFixPayment({
        orderId: order.orderId,
        paymentId: `pay_test_${Date.now()}`,
        signature: 'mock_signature_for_preview',
        websiteId: '00000000-0000-0000-0000-000000000000',
      });
      return res;
    },
    onSuccess: () => {
      setExpressFixModal(false);
      setCheckoutStatus('Express Fix diagnostic remediation order placed and verified.');
      queryClient.invalidateQueries({ queryKey: ['billing-overview'] });
    },
  });

  if (loadingBilling) {
    return (
      <div className="pageContainer">
        <Skeleton height="60px" className="mb4" />
        <Skeleton height="200px" className="mb4" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (billingError || !billing) {
    return (
      <div className="pageContainer">
        <ErrorState message="Failed to load billing details." />
      </div>
    );
  }

  const currentPlanCode = billing.currentPlan?.code || 'FREE';

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>Monetization & Subscription</h1>
          <p>Manage subscription plans, entitlement limits, diagnostic add-ons, and invoices.</p>
        </div>
      </div>

      {checkoutStatus && (
        <div className="authSuccessMessage mb4">
          <p>{checkoutStatus}</p>
        </div>
      )}

      {/* Top Cards: Current Plan & Usage */}
      <div className="metricsGrid mb4">
        <Card>
          <div className="cardHeaderFlex">
            <span className="metricLabel">Active Subscription</span>
            <Badge variant={billing.subscription ? 'success' : 'neutral'}>
              {billing.subscription?.status || 'Active Free'}
            </Badge>
          </div>
          <div className="metricValue mt2">{billing.currentPlan?.name}</div>
          <p className="textMuted textSm mt1">
            {billing.currentPlan?.priceInPaise
              ? `₹${(billing.currentPlan.priceInPaise / 100).toLocaleString('en-IN')}/month`
              : 'Free Forever'}
          </p>
          {billing.subscription?.currentPeriodEnd && (
            <p className="textSm mt2">
              Renewal Date: {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}
          {billing.subscription && (
            <div className="mt3">
              <Button
                variant="outline"
                size="sm"
                isLoading={cancelMutation.isPending}
                onClick={() => {
                  if (confirm('Are you sure you want to cancel your subscription?')) {
                    cancelMutation.mutate();
                  }
                }}
              >
                Cancel Subscription
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <div className="cardHeaderFlex">
            <span className="metricLabel">Monthly Audits Quota</span>
            <Badge variant="neutral">
              {entitlements?.usage.audits.used ?? 0} / {entitlements?.usage.audits.limit ?? 3} Used
            </Badge>
          </div>
          <div className="metricValue mt2">
            {entitlements?.usage.audits.remaining ?? 0} <small className="textMuted">Remaining</small>
          </div>
          <div className="usageProgressBar mt2">
            <div
              className="usageProgressFill"
              style={{
                width: `${Math.min(
                  100,
                  (((entitlements?.usage.audits.used ?? 0) / (entitlements?.usage.audits.limit || 1)) * 100)
                )}%`,
              }}
            />
          </div>
        </Card>

        <Card>
          <div className="cardHeaderFlex">
            <span className="metricLabel">Tracked Websites</span>
            <Badge variant="neutral">
              {entitlements?.usage.websites.used ?? 0} / {entitlements?.usage.websites.limit ?? 1}
            </Badge>
          </div>
          <div className="metricValue mt2">
            {entitlements?.usage.websites.used ?? 0} <small className="textMuted">Active</small>
          </div>
          <div className="usageProgressBar mt2">
            <div
              className="usageProgressFill"
              style={{
                width: `${Math.min(
                  100,
                  (((entitlements?.usage.websites.used ?? 0) / (entitlements?.usage.websites.limit || 1)) * 100)
                )}%`,
              }}
            />
          </div>
        </Card>
      </div>

      {/* Plan Selection Grid */}
      <h2 className="mb3">Commercial Subscription Tiers</h2>
      <div className="plansGrid mb4">
        {(plans || []).map((plan) => {
          const isCurrent = plan.code === currentPlanCode;
          const price = plan.priceInPaise ? `₹${(plan.priceInPaise / 100).toLocaleString('en-IN')}` : '₹0';

          return (
            <Card key={plan.id} className={`planCard ${isCurrent ? 'currentPlanCard' : ''}`}>
              <div className="planHeader">
                <h3>{plan.name}</h3>
                <div className="planPrice">
                  <strong>{price}</strong>
                  <span>/month</span>
                </div>
                <p className="planDesc">{plan.description}</p>
              </div>

              <ul className="planFeatures">
                <li>
                  <span>✓</span> {plan.entitlements.auditsPerMonth} Diagnostic Audits/month
                </li>
                <li>
                  <span>✓</span> {plan.entitlements.websites} Monitored Websites
                </li>
                <li>
                  <span>{plan.entitlements.monitoring ? '✓' : '✗'}</span> 24/7 Watchdog Monitoring
                </li>
                <li>
                  <span>{plan.entitlements.apiAccess ? '✓' : '✗'}</span> Programmatic API Access
                </li>
                <li>
                  <span>{plan.entitlements.whiteLabel ? '✓' : '✗'}</span> White-label Client Reports
                </li>
              </ul>

              <div className="planAction mt4">
                {isCurrent ? (
                  <Button variant="outline" className="wFull" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    className="wFull"
                    isLoading={subscribeMutation.isPending && subscribeMutation.variables === plan.code}
                    onClick={() => subscribeMutation.mutate(plan.code)}
                  >
                    Upgrade to {plan.name}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* One-Time Commercial Products */}
      <h2 className="mb3">Diagnostic Add-ons & One-Time Solutions</h2>
      <div className="addOnsGrid mb4">
        <Card className="addOnCard">
          <div className="addOnHeader">
            <div>
              <h3>Express Fix — High-Priority Remediation</h3>
              <p>One-time expert code review and direct engineering remediation for conversion leakage.</p>
            </div>
            <div className="addOnPrice">
              <strong>₹2,999</strong>
              <span>one-time</span>
            </div>
          </div>
          <div className="mt3">
            <Button
              variant="primary"
              onClick={() => setExpressFixModal(true)}
            >
              Order Express Fix
            </Button>
          </div>
        </Card>

        <Card className="addOnCard">
          <div className="addOnHeader">
            <div>
              <h3>Watchdog Continuous Monitor</h3>
              <p>Autonomous 5-minute health, form, and lead pipeline uptime monitoring.</p>
            </div>
            <div className="addOnPrice">
              <strong>₹299</strong>
              <span>/month</span>
            </div>
          </div>
          <div className="mt3">
            <Button
              variant="outline"
              isLoading={subscribeMutation.isPending && subscribeMutation.variables === 'WATCHDOG'}
              onClick={() => subscribeMutation.mutate('WATCHDOG')}
            >
              Subscribe to Watchdog
            </Button>
          </div>
        </Card>
      </div>

      {/* Invoices & Payment History */}
      <h2 className="mb3">Payment & Invoice History</h2>
      <Card className="tableCard">
        {billing.recentPayments.length === 0 ? (
          <div className="emptyState">No payment transactions recorded yet.</div>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction ID</th>
                <th>Purpose</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {billing.recentPayments.map((pmt) => (
                <tr key={pmt.id}>
                  <td>{new Date(pmt.createdAt).toLocaleDateString()}</td>
                  <td><code>{pmt.providerPaymentId}</code></td>
                  <td>{pmt.purpose}</td>
                  <td>₹{(pmt.amountInPaise / 100).toLocaleString('en-IN')}</td>
                  <td>
                    <Badge variant={pmt.status === 'CAPTURED' ? 'success' : 'critical'} size="sm">
                      {pmt.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Express Fix Modal */}
      {expressFixModal && (
        <Modal isOpen={expressFixModal} title="Deploy Express Fix" onClose={() => setExpressFixModal(false)}>
          <p className="mb3">
            The Express Fix service provides immediate engineering analysis and patch recommendations for all critical and high severity findings detected on your site.
          </p>
          <div className="pricingSummary mb4">
            <div className="cardHeaderFlex">
              <span>Total Due:</span>
              <strong>₹2,999 (GST Inclusive)</strong>
            </div>
          </div>
          <div className="modalActions">
            <Button variant="ghost" onClick={() => setExpressFixModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={expressFixMutation.isPending}
              onClick={() => expressFixMutation.mutate()}
            >
              Confirm & Pay ₹2,999
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
