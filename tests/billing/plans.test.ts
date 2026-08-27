import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';

describe('Billing: Commercial Plans & Entitlement Definitions (Requirement 7, 38)', () => {
  it('retrieves public commercial plans with pricing in paise and granular entitlements', async () => {
    const res = await request(app).get('/api/v1/billing/plans');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const plans = res.body.data;
    expect(plans.length).toBeGreaterThanOrEqual(4);

    const proPlan = plans.find((p: { code: string }) => p.code === 'PRO');
    expect(proPlan).toBeDefined();
    expect(proPlan.priceInPaise).toBe(499900); // ₹4,999
    expect(proPlan.currency).toBe('INR');
    expect(proPlan.entitlements.auditsPerMonth).toBe(50);
    expect(proPlan.entitlements.websites).toBe(5);
    expect(proPlan.entitlements.monitoring).toBe(true);
    expect(proPlan.entitlements.apiAccess).toBe(true);

    const agencyPlan = plans.find((p: { code: string }) => p.code === 'AGENCY');
    expect(agencyPlan).toBeDefined();
    expect(agencyPlan.priceInPaise).toBe(1499900); // ₹14,999
    expect(agencyPlan.entitlements.auditsPerMonth).toBe(500);
    expect(agencyPlan.entitlements.whiteLabel).toBe(true);
  });
});
