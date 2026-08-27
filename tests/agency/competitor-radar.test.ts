import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Competitive Weakness Radar (LG-020)', () => {
  let agencyOrg: any;
  let user: any;
  let token: string;

  beforeEach(async () => {
    const email = `competitor.tester.${Date.now()}@leadguard.test`;
    user = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    agencyOrg = await db.organization.create({
      data: { name: 'Radar Intelligence Agency', slug: `radar-agency-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: agencyOrg.id, userId: user.id, role: 'OWNER' },
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
        organizationId: agencyOrg.id,
        planId: agencyPlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_radar_${Date.now()}`,
      },
    });

    token = createAccessToken(user.id, agencyOrg.id);
  });

  it('creates competitor comparison, triggers benchmark, and lists results', async () => {
    const createRes = await request(app)
      .post('/api/v1/agency/competitors')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Dental Care Rivalry Benchmark',
        targetUrl: 'https://apexdental.com',
        competitorUrls: ['https://rivaldental1.com', 'https://rivaldental2.com'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.targetUrl).toBe('https://apexdental.com/');
    expect(createRes.body.data.competitorUrls.length).toBe(2);

    const compId = createRes.body.data.id;

    // Trigger run
    const runRes = await request(app)
      .post(`/api/v1/agency/competitors/${compId}/run`)
      .set('Authorization', `Bearer ${token}`);

    expect(runRes.status).toBe(202);
    expect(runRes.body.data.enqueued).toBe(true);

    // List comparisons
    const listRes = await request(app)
      .get('/api/v1/agency/competitors')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].id).toBe(compId);
  });
});
