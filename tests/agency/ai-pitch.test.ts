import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Grounded AI Cold Pitch Generator (LG-023)', () => {
  let agencyOrg: any;
  let user: any;
  let token: string;
  let prospect: any;

  beforeEach(async () => {
    const email = `pitch.tester.${Date.now()}@leadguard.test`;
    user = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    agencyOrg = await db.organization.create({
      data: { name: 'Pitch Mastery Agency', slug: `pitch-agency-${Date.now()}` },
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
        providerSubscriptionId: `sub_pitch_${Date.now()}`,
      },
    });

    const campaign = await db.prospectCampaign.create({
      data: {
        organizationId: agencyOrg.id,
        name: 'Chiropractic Campaign',
        source: 'MANUAL',
        targetCount: 1,
        status: 'COMPLETED',
      },
    });

    prospect = await db.prospect.create({
      data: {
        campaignId: campaign.id,
        organizationId: agencyOrg.id,
        url: 'https://apexchiro.com',
        normalizedUrl: 'https://apexchiro.com/',
        domain: 'apexchiro.com',
        businessName: 'Apex Chiropractic',
        leadScore: 58,
        criticalFindings: 2,
        highFindings: 3,
        status: 'AUDITED',
      },
    });

    token = createAccessToken(user.id, agencyOrg.id);
  });

  it('generates grounded pitch strictly referencing actual audit findings without hallucinated claims', async () => {
    const res = await request(app)
      .post(`/api/v1/agency/prospects/${prospect.id}/pitches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tone: 'DIRECT', language: 'en' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const pitch = res.body.data;
    expect(pitch.prospectId).toBe(prospect.id);
    expect(pitch.subject).toContain('apexchiro.com');
    expect(pitch.subject).toContain('58/100'); // Grounded in real lead score
    expect(pitch.problem).toContain('2 critical'); // Grounded in real critical count
    expect(pitch.promptVersion).toBe('v1');
    expect(pitch.tone).toBe('DIRECT');

    // Pitch list
    const listRes = await request(app)
      .get(`/api/v1/agency/prospects/${prospect.id}/pitches`)
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0].id).toBe(pitch.id);
  });
});
