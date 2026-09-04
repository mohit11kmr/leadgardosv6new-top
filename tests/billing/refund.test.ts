import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { refundService, RefundValidationError } from '../../apps/api/src/services/billing/refundService.js';
import { razorpayProvider } from '../../apps/api/src/billing/razorpayProvider.js';

const TEST_PASSWORD = 'RefundTestPassword1234!';

async function makeOrgAndAdmin(capabilities: string[] = ['REFUND_ISSUE', 'FINANCE_VIEW']) {
  const org = await db.organization.create({
    data: { name: `Refund Org ${Date.now()}`, slug: `refund-org-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  const { hashPassword } = await import('../../apps/api/src/auth.js');
  const user = await db.user.create({
    data: {
      email: `refund_admin_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      platformAdmin: true,
      platformCapabilities: capabilities,
    },
  });
  const token = createAccessToken(user.id, org.id);
  return { org, user, token };
}

async function makePayment(organizationId: string, amountInPaise: number, status: 'CAPTURED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' = 'CAPTURED') {
  return db.payment.create({
    data: {
      organizationId,
      providerPaymentId: `pay_refund_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      amountInPaise,
      status,
    },
  });
}

describe('RefundService — validation and safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects an incorrect current password (re-authentication)', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    await expect(
      refundService.requestAndIssueRefund({
        organizationId: org.id,
        paymentId: payment.id,
        amountInPaise: 50_000,
        reason: 'Customer requested',
        requestedByUserId: user.id,
        currentPassword: 'wrong-password',
      })
    ).rejects.toThrow(RefundValidationError);
  });

  it('rejects a payment belonging to a different organization (tenant isolation)', async () => {
    const { user } = await makeOrgAndAdmin();
    const otherOrg = await db.organization.create({ data: { name: 'Other Org', slug: `other-org-${Date.now()}` } });
    const payment = await makePayment(otherOrg.id, 100_000);
    const { org: callerOrg } = await makeOrgAndAdmin();

    await expect(
      refundService.requestAndIssueRefund({
        organizationId: callerOrg.id, // caller claims a DIFFERENT org than the payment actually belongs to
        paymentId: payment.id,
        amountInPaise: 50_000,
        reason: 'test',
        requestedByUserId: user.id,
        currentPassword: TEST_PASSWORD,
      })
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
  });

  it('rejects an amount exceeding the captured payment amount', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    await expect(
      refundService.requestAndIssueRefund({
        organizationId: org.id,
        paymentId: payment.id,
        amountInPaise: 200_000, // more than captured
        reason: 'test',
        requestedByUserId: user.id,
        currentPassword: TEST_PASSWORD,
      })
    ).rejects.toMatchObject({ code: 'AMOUNT_EXCEEDS_REMAINING' });
  });

  it('rejects a payment that is not in a refundable state', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000, 'REFUNDED');

    await expect(
      refundService.requestAndIssueRefund({
        organizationId: org.id,
        paymentId: payment.id,
        amountInPaise: 10_000,
        reason: 'test',
        requestedByUserId: user.id,
        currentPassword: TEST_PASSWORD,
      })
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_REFUNDABLE' });
  });

  it('processes a full refund end-to-end and marks the Payment REFUNDED', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    const refund = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 100_000,
      reason: 'Full refund test',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
    });

    expect(refund.status).toBe('SUCCEEDED');
    expect(refund.providerRefundId).toBeTruthy();

    const updatedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('REFUNDED');
  });

  it('processes a partial refund and marks the Payment PARTIALLY_REFUNDED', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    const refund = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 40_000,
      reason: 'Partial refund test',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
    });

    expect(refund.status).toBe('SUCCEEDED');
    const updatedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('PARTIALLY_REFUNDED');
  });

  it('never allows cumulative refunds to exceed the captured amount across two sequential partial refunds', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 60_000,
      reason: 'First partial',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
    });

    // A second refund for 60,000 more would total 120,000 > the 100,000 captured — must be rejected.
    await expect(
      refundService.requestAndIssueRefund({
        organizationId: org.id,
        paymentId: payment.id,
        amountInPaise: 60_000,
        reason: 'Second partial (would exceed)',
        requestedByUserId: user.id,
        currentPassword: TEST_PASSWORD,
      })
    ).rejects.toMatchObject({ code: 'AMOUNT_EXCEEDS_REMAINING' });
  });

  it('a retried request with the same idempotencyKey returns the original refund, not a new one', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);
    const idempotencyKey = `idem-${Date.now()}`;

    const first = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 50_000,
      reason: 'test',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
      idempotencyKey,
    });

    const second = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 50_000,
      reason: 'test (retried)',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
      idempotencyKey,
    });

    expect(second.id).toBe(first.id);
    const allRefundsForPayment = await db.refund.findMany({ where: { paymentId: payment.id } });
    expect(allRefundsForPayment).toHaveLength(1);
  });

  it('concurrent duplicate refund requests against the same payment: only one succeeds, the other is rejected for exceeding the remaining amount', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    const attempts = await Promise.allSettled([
      refundService.requestAndIssueRefund({
        organizationId: org.id,
        paymentId: payment.id,
        amountInPaise: 70_000,
        reason: 'Concurrent A',
        requestedByUserId: user.id,
        currentPassword: TEST_PASSWORD,
      }),
      refundService.requestAndIssueRefund({
        organizationId: org.id,
        paymentId: payment.id,
        amountInPaise: 70_000,
        reason: 'Concurrent B',
        requestedByUserId: user.id,
        currentPassword: TEST_PASSWORD,
      }),
    ]);

    const succeeded = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');
    // Both 70,000 requests can't both succeed against a 100,000 payment —
    // at most one succeeds (the row lock serializes them), the other must
    // be rejected for exceeding the remaining refundable amount.
    expect(succeeded.length).toBe(1);
    expect(rejected.length).toBe(1);

    const totalRefunded = await db.refund.aggregate({
      where: { paymentId: payment.id, status: 'SUCCEEDED' },
      _sum: { amountInPaise: true },
    });
    expect(totalRefunded._sum.amountInPaise).toBeLessThanOrEqual(100_000);
  });

  it('marks the refund FAILED (not SUCCEEDED) when the provider rejects the request, and does not update Payment.status', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);
    vi.spyOn(razorpayProvider, 'refundPayment').mockRejectedValueOnce(new Error('Razorpay: refund rejected by bank'));

    const refund = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 50_000,
      reason: 'Provider will reject this',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
    });

    expect(refund.status).toBe('FAILED');
    expect(refund.failureReason).toContain('rejected by bank');

    const updatedPayment = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('CAPTURED'); // unchanged — never marked refunded for a failed provider call
  });

  it('marks the refund FAILED (not stuck at PROCESSING) when the provider times out', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);
    vi.spyOn(razorpayProvider, 'refundPayment').mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const refund = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 50_000,
      reason: 'Provider will time out',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
    });

    expect(refund.status).toBe('FAILED');
  });

  it('creates a real AdminAuditLog entry for the full requested→approved→succeeded lifecycle', async () => {
    const { org, user } = await makeOrgAndAdmin();
    const payment = await makePayment(org.id, 100_000);

    const refund = await refundService.requestAndIssueRefund({
      organizationId: org.id,
      paymentId: payment.id,
      amountInPaise: 30_000,
      reason: 'Audit trail check',
      requestedByUserId: user.id,
      currentPassword: TEST_PASSWORD,
    });

    const logs = await db.adminAuditLog.findMany({ where: { resourceId: refund.id }, orderBy: { createdAt: 'asc' } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('REFUND_REQUESTED');
    expect(actions).toContain('REFUND_APPROVED');
    expect(actions).toContain('REFUND_SUCCEEDED');
    // Never leaks secrets into the audit metadata.
    const serialized = JSON.stringify(logs.map((l) => l.details));
    expect(serialized).not.toContain(TEST_PASSWORD);
  });
});

describe('POST/GET /admin/refunds — authorization', () => {
  it('rejects a platformAdmin without REFUND_ISSUE capability', async () => {
    const { org, token } = await makeOrgAndAdmin(['FINANCE_VIEW']); // no REFUND_ISSUE
    const payment = await makePayment(org.id, 100_000);

    const res = await request(app)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: org.id, paymentId: payment.id, amountInPaise: 10_000, reason: 'test', currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('issues a refund end-to-end via the API with REFUND_ISSUE capability', async () => {
    const { org, token } = await makeOrgAndAdmin(['REFUND_ISSUE']);
    const payment = await makePayment(org.id, 80_000);

    const res = await request(app)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: org.id, paymentId: payment.id, amountInPaise: 80_000, reason: 'Full API refund', currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SUCCEEDED');
  });

  it('returns 400 (not 500) for a validation failure like an amount exceeding the payment', async () => {
    const { org, token } = await makeOrgAndAdmin(['REFUND_ISSUE']);
    const payment = await makePayment(org.id, 10_000);

    const res = await request(app)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: org.id, paymentId: payment.id, amountInPaise: 999_999, reason: 'test', currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AMOUNT_EXCEEDS_REMAINING');
  });

  it('rejects an unauthenticated GET /admin/refunds', async () => {
    const res = await request(app).get('/api/v1/admin/refunds');
    expect(res.status).toBe(401);
  });

  it('lists refunds and can filter by organizationId, never leaking another org’s refunds', async () => {
    // A single internal admin issues refunds against two different
    // customer orgs — REFUND_ISSUE is a platform-admin capability, not
    // tied to org membership, so one admin user acting on behalf of the
    // platform is the realistic shape here.
    const { org: orgA, user: admin, token } = await makeOrgAndAdmin(['REFUND_ISSUE', 'FINANCE_VIEW']);
    const orgB = await db.organization.create({ data: { name: 'Refund Org B', slug: `refund-org-b-${Date.now()}` } });
    const paymentA = await makePayment(orgA.id, 50_000);
    const paymentB = await makePayment(orgB.id, 50_000);

    await refundService.requestAndIssueRefund({
      organizationId: orgA.id,
      paymentId: paymentA.id,
      amountInPaise: 10_000,
      reason: 'org A refund',
      requestedByUserId: admin.id,
      currentPassword: TEST_PASSWORD,
    });
    await refundService.requestAndIssueRefund({
      organizationId: orgB.id,
      paymentId: paymentB.id,
      amountInPaise: 10_000,
      reason: 'org B refund',
      requestedByUserId: admin.id,
      currentPassword: TEST_PASSWORD,
    });

    const res = await request(app)
      .get('/api/v1/admin/refunds')
      .query({ organizationId: orgB.id })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items.every((r: { organizationId: string }) => r.organizationId === orgB.id)).toBe(true);
  });
});
