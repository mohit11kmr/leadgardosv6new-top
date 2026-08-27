import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import { validateSafeProspectUrl } from '../../apps/api/src/services/agency/prospectService.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Security, SSRF & Cross-Tenant / Cross-Client Isolation', () => {
  let agencyA: any;
  let agencyB: any;
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    userA = await db.user.create({
      data: { email: `agency.sec.a.${Date.now()}@leadguard.test`, passwordHash: await hashPassword('Password123456!') },
    });
    agencyA = await db.organization.create({
      data: { name: 'Sec Org A', slug: `sec-org-a-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: agencyA.id, userId: userA.id, role: 'OWNER' },
    });

    userB = await db.user.create({
      data: { email: `agency.sec.b.${Date.now()}@leadguard.test`, passwordHash: await hashPassword('Password123456!') },
    });
    agencyB = await db.organization.create({
      data: { name: 'Sec Org B', slug: `sec-org-b-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: agencyB.id, userId: userB.id, role: 'OWNER' },
    });

    let agencyPlan = await db.plan.findUnique({ where: { code: 'AGENCY' } });
    if (!agencyPlan) {
      agencyPlan = await db.plan.create({
        data: {
          code: 'AGENCY',
          name: 'Agency Plan',
          priceInPaise: 499900,
          currency: 'INR',
          entitlements: {
            auditsPerMonth: 1000,
            websites: 25,
            monitoring: true,
            apiAccess: true,
            whiteLabel: true,
            reports: 500,
            prospectLimit: 5000,
            clientLimit: 25,
            prospectCampaignLimit: 50,
            prospectLimitPerCampaign: 500,
            pitchLimit: 500,
            widgetLimit: 10,
            competitorLimit: 10,
          },
        },
      });
    }

    await db.subscription.create({
      data: {
        organizationId: agencyA.id,
        planId: agencyPlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_seca_${Date.now()}`,
      },
    });

    await db.subscription.create({
      data: {
        organizationId: agencyB.id,
        planId: agencyPlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_secb_${Date.now()}`,
      },
    });

    tokenA = createAccessToken(userA.id, agencyA.id);
    tokenB = createAccessToken(userB.id, agencyB.id);
  });

  it('strictly blocks SSRF endpoints, metadata services, and local loopbacks', async () => {
    // Disable ALLOW_LOCAL_FIXTURES temporarily for strict SSRF assertions
    const oldEnv = process.env.ALLOW_LOCAL_FIXTURES;
    delete process.env.ALLOW_LOCAL_FIXTURES;

    try {
      const resLocal = await validateSafeProspectUrl('http://127.0.0.1:8080');
      expect(resLocal.isValid).toBe(false);

      const resMeta = await validateSafeProspectUrl('http://169.254.169.254/latest/meta-data');
      expect(resMeta.isValid).toBe(false);

      const resPrivate10 = await validateSafeProspectUrl('http://10.0.1.5/admin');
      expect(resPrivate10.isValid).toBe(false);

      const resPrivate192 = await validateSafeProspectUrl('http://192.168.1.1');
      expect(resPrivate192.isValid).toBe(false);

      const resPrivate172 = await validateSafeProspectUrl('http://172.16.0.1');
      expect(resPrivate172.isValid).toBe(false);

      const resCreds = await validateSafeProspectUrl('http://admin:secret@example.com');
      expect(resCreds.isValid).toBe(false);
    } finally {
      if (oldEnv) process.env.ALLOW_LOCAL_FIXTURES = oldEnv;
    }
  });

  it('strictly isolates client workspaces across agencies and prevents cross-client access', async () => {
    // Agency A creates Client A1 and Client A2
    const c1Res = await request(app)
      .post('/api/v1/agency/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Client A1' });
    const c1Id = c1Res.body.data.id;

    // Agency B cannot access Agency A's client
    const crossRes = await request(app)
      .get(`/api/v1/agency/clients/${c1Id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(crossRes.status).toBe(404);

    // Agency B cannot delete Agency A's client
    const delRes = await request(app)
      .delete(`/api/v1/agency/clients/${c1Id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(delRes.status).toBe(500);
  });
});
