import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Diagnostic Studio Widgets & Public Security (LG-028)', () => {
  let agencyOrg: any;
  let user: any;
  let token: string;

  beforeEach(async () => {
    const email = `widget.tester.${Date.now()}@leadguard.test`;
    user = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    agencyOrg = await db.organization.create({
      data: { name: 'Widget Studio Agency', slug: `widget-agency-${Date.now()}` },
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
        providerSubscriptionId: `sub_widget_${Date.now()}`,
      },
    });

    token = createAccessToken(user.id, agencyOrg.id);
  });

  it('creates widget with hashed secret, validates origin, and returns only public diagnostic telemetry', async () => {
    // 1. Create Widget
    const createRes = await request(app)
      .post('/api/v1/agency/widgets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Homepage Lead Magnet',
        allowedOrigins: ['https://myagency.com', 'https://staging.myagency.com'],
        theme: 'DARK',
        displayMode: 'EMBED',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.rawToken).toBeDefined(); // Revealed once on creation
    expect(createRes.body.data.tokenHash).toBeUndefined(); // Hash never exposed to client

    const widgetId = createRes.body.data.id;

    // 2. Query public endpoint with valid Origin header
    const validPublicRes = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Origin', 'https://myagency.com');

    expect(validPublicRes.status).toBe(200);
    expect(validPublicRes.body.success).toBe(true);
    expect(validPublicRes.body.data.name).toBe('Homepage Lead Magnet');
    expect(validPublicRes.body.data.theme).toBe('DARK');
    // Verify zero sensitive data leakage
    expect(validPublicRes.body.data.tokenHash).toBeUndefined();
    expect(validPublicRes.body.data.organizationId).toBeUndefined();
    expect(validPublicRes.body.data.apiKey).toBeUndefined();

    // 3. Query public endpoint with unauthorized Origin header
    const forbiddenPublicRes = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Origin', 'https://attacker.com');

    expect(forbiddenPublicRes.status).toBe(403);
    expect(forbiddenPublicRes.body.error.code).toBe('ORIGIN_FORBIDDEN');
  });
});
