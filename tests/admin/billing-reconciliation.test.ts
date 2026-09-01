import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

/**
 * BE-1/AR-1 regression tests for the newly-wired POST /admin/billing/reconciliation.
 *
 * Scope note: billingReconciliationService (unchanged by this phase, see
 * apps/api/src/services/billingReconciliationService.ts) is detection-only —
 * it never calls a live Razorpay API and never writes to Subscription/Payment.
 * In MOCK/TEST provider mode (used here and in CI) it validates structural
 * referential integrity of provider-bound IDs (expected prefix, positive
 * amount) rather than diffing against a real remote provider response, since
 * there is no live provider to diff against in this environment. This phase
 * wired the SERVICE (a caller + audit trail + authorization), not a new
 * provider-diffing algorithm, per the task's explicit "do not invent a new
 * billing architecture" instruction.
 *
 * One item from the task's Section 7 list does not map onto the actual,
 * intentionally-scoped implementation: "remote-paid-local-open-correct-
 * transition". The wired service never transitions local billing state
 * automatically — doing so was explicitly out of scope (Section 6: "must
 * NOT blindly overwrite local state from remote state"), so there is no
 * transition behavior to test. This is recorded in the Phase 2A report
 * rather than tested against nonexistent behavior.
 */
describe('Admin Billing Reconciliation (BE-1/AR-1)', () => {
  let platformAdmin: any;
  let ownerUser: any;
  let org: any;
  let proPlan: any;
  let platformToken: string;
  let ownerToken: string;

  beforeAll(async () => {
    platformAdmin = await db.user.create({
      data: { email: `billing-admin-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash', platformAdmin: true },
    });
    ownerUser = await db.user.create({
      data: { email: `billing-owner-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: `Billing Recon Org ${Date.now()}`, slug: `billing-recon-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: ownerUser.id, role: 'OWNER' },
    });

    proPlan = await db.plan.upsert({
      where: { code: 'PRO' },
      create: {
        code: 'PRO',
        name: 'Pro',
        priceInPaise: 499900,
        currency: 'INR',
        entitlements: { auditsPerMonth: 100, websites: 5, monitoring: true, apiAccess: true, whiteLabel: false, reports: 50, prospectLimit: 100 },
      },
      update: {},
    });

    platformToken = createAccessToken(platformAdmin.id, org.id);
    ownerToken = createAccessToken(ownerUser.id, org.id);
  });

  it('unauthorized-trigger-blocked: rejects a non-platform-admin (org owner) with 403 and performs no reconciliation', async () => {
    const res = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ organizationId: org.id });

    expect(res.status).toBe(403);
  });

  it('matching-states-no-change: a subscription/payment with well-formed provider IDs produces zero discrepancies', async () => {
    const cleanOrg = await db.organization.create({
      data: { name: `Clean Billing Org ${Date.now()}`, slug: `clean-billing-${Date.now()}-${Math.random()}` },
    });
    await db.subscription.create({
      data: { organizationId: cleanOrg.id, planId: proPlan.id, status: 'ACTIVE', providerSubscriptionId: `sub_mock_${Date.now()}` },
    });
    await db.payment.create({
      data: {
        organizationId: cleanOrg.id,
        providerPaymentId: `pay_${Date.now()}abc`,
        providerOrderId: `order_mock_${Date.now()}`,
        amountInPaise: 49900,
        status: 'CAPTURED',
      },
    });

    const res = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: cleanOrg.id });

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptions.checked).toBe(1);
    expect(res.body.data.subscriptions.discrepancies).toEqual([]);
    expect(res.body.data.payments.checked).toBe(1);
    expect(res.body.data.payments.discrepancies).toEqual([]);
    expect(res.body.data.totalDiscrepancies).toBe(0);
  });

  it('detects-drift: malformed provider IDs and a non-positive amount surface as discrepancies (admin-trigger-allowed)', async () => {
    const driftOrg = await db.organization.create({
      data: { name: `Drift Billing Org ${Date.now()}`, slug: `drift-billing-${Date.now()}-${Math.random()}` },
    });
    await db.subscription.create({
      // Missing the expected sub_mock_/sub_test_ prefix — simulates a local
      // record that has drifted from what the provider would actually issue.
      data: { organizationId: driftOrg.id, planId: proPlan.id, status: 'ACTIVE', providerSubscriptionId: 'not-a-real-provider-id' },
    });
    await db.payment.create({
      data: {
        organizationId: driftOrg.id,
        providerPaymentId: 'not-a-real-pay-id',
        amountInPaise: 0,
        status: 'CAPTURED',
      },
    });

    const res = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: driftOrg.id });

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptions.discrepancies.length).toBeGreaterThan(0);
    expect(res.body.data.subscriptions.discrepancies[0].entityType).toBe('SUBSCRIPTION');
    expect(res.body.data.payments.discrepancies.length).toBeGreaterThan(0);
    expect(res.body.data.payments.discrepancies.some((d: any) => d.field === 'amountInPaise')).toBe(true);
    expect(res.body.data.totalDiscrepancies).toBeGreaterThan(0);

    // Auditable: the run itself is logged, regardless of outcome.
    const logs = await db.adminAuditLog.findMany({
      where: { resourceId: driftOrg.id, action: 'BILLING_RECONCILIATION_RUN' },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect((logs[0].details as any).totalDiscrepancies).toBe(res.body.data.totalDiscrepancies);
  });

  it('tenant-safe: an organizationId filter never returns another organization\'s discrepancies', async () => {
    const orgA = await db.organization.create({ data: { name: `Org A ${Date.now()}`, slug: `org-a-${Date.now()}-${Math.random()}` } });
    const orgB = await db.organization.create({ data: { name: `Org B ${Date.now()}`, slug: `org-b-${Date.now()}-${Math.random()}` } });
    await db.subscription.create({
      data: { organizationId: orgA.id, planId: proPlan.id, status: 'ACTIVE', providerSubscriptionId: 'bad-id-org-a' },
    });
    await db.subscription.create({
      data: { organizationId: orgB.id, planId: proPlan.id, status: 'ACTIVE', providerSubscriptionId: `sub_mock_${Date.now()}` },
    });

    const res = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: orgB.id });

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptions.checked).toBe(1);
    expect(res.body.data.subscriptions.discrepancies).toEqual([]);
  });

  it('provider-failure-safe-error-handling: an organization with no billing records completes safely with zero counts (no throw)', async () => {
    const emptyOrg = await db.organization.create({
      data: { name: `Empty Billing Org ${Date.now()}`, slug: `empty-billing-${Date.now()}-${Math.random()}` },
    });

    const res = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: emptyOrg.id });

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptions.checked).toBe(0);
    expect(res.body.data.payments.checked).toBe(0);
    expect(res.body.data.totalDiscrepancies).toBe(0);
  });

  it('duplicate-reconciliation-idempotent: running the same reconciliation twice yields identical discrepancy results and mutates no billing rows', async () => {
    const idemOrg = await db.organization.create({
      data: { name: `Idempotent Billing Org ${Date.now()}`, slug: `idem-billing-${Date.now()}-${Math.random()}` },
    });
    await db.subscription.create({
      data: { organizationId: idemOrg.id, planId: proPlan.id, status: 'ACTIVE', providerSubscriptionId: 'still-bad-id' },
    });

    const before = await db.subscription.findMany({ where: { organizationId: idemOrg.id } });

    const res1 = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: idemOrg.id });
    const res2 = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: idemOrg.id });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.data.subscriptions.discrepancies).toEqual(res2.body.data.subscriptions.discrepancies);
    expect(res1.body.data.totalDiscrepancies).toBe(res2.body.data.totalDiscrepancies);

    const after = await db.subscription.findMany({ where: { organizationId: idemOrg.id } });
    expect(after).toEqual(before);

    // Each admin-triggered run is independently logged (an audit trail is
    // the intended effect of calling it twice) — not a "duplicate side
    // effect" on billing state, which is what Section 6 actually forbids.
    const logs = await db.adminAuditLog.findMany({
      where: { resourceId: idemOrg.id, action: 'BILLING_RECONCILIATION_RUN' },
    });
    expect(logs.length).toBe(2);
  });

  it('rejects a malformed organizationId with a 400 (input validation)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/billing/reconciliation')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });
});
