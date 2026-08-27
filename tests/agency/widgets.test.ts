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

  it('creates widget with hashed secret, validates origin and token, and supports token rotation', async () => {
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
    const widgetToken = createRes.body.data.rawToken;

    // 2. Query public endpoint without token -> 401 MISSING_WIDGET_TOKEN
    const noTokenRes = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Origin', 'https://myagency.com');
    expect(noTokenRes.status).toBe(401);
    expect(noTokenRes.body.error.code).toBe('MISSING_WIDGET_TOKEN');

    // 3. Query public endpoint with invalid token -> 401 INVALID_WIDGET_TOKEN
    const invalidTokenRes = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Authorization', 'Bearer lgw_invalid_fake_token_123456')
      .set('Origin', 'https://myagency.com');
    expect(invalidTokenRes.status).toBe(401);
    expect(invalidTokenRes.body.error.code).toBe('INVALID_WIDGET_TOKEN');

    // 4. Query public endpoint with valid token + valid Origin -> 200 OK
    const validPublicRes = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Authorization', `Bearer ${widgetToken}`)
      .set('Origin', 'https://myagency.com');

    expect(validPublicRes.status).toBe(200);
    expect(validPublicRes.body.success).toBe(true);
    expect(validPublicRes.body.data.name).toBe('Homepage Lead Magnet');
    expect(validPublicRes.body.data.theme).toBe('DARK');
    // Verify zero sensitive data leakage
    expect(validPublicRes.body.data.tokenHash).toBeUndefined();
    expect(validPublicRes.body.data.organizationId).toBeUndefined();
    expect(validPublicRes.body.data.apiKey).toBeUndefined();

    // 5. Query public endpoint with unauthorized Origin header -> 403 ORIGIN_FORBIDDEN
    const forbiddenOriginRes = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Authorization', `Bearer ${widgetToken}`)
      .set('Origin', 'https://attacker.com');

    expect(forbiddenOriginRes.status).toBe(403);
    expect(forbiddenOriginRes.body.error.code).toBe('ORIGIN_FORBIDDEN');

    // 6. Rotate Widget Token
    const rotateRes = await request(app)
      .post(`/api/v1/agency/widgets/${widgetId}/regenerate-token`)
      .set('Authorization', `Bearer ${token}`);

    expect(rotateRes.status).toBe(200);
    const newWidgetToken = rotateRes.body.data.rawToken;
    expect(newWidgetToken).not.toBe(widgetToken);

    // Old token must immediately fail
    const oldTokenCheck = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Authorization', `Bearer ${widgetToken}`)
      .set('Origin', 'https://myagency.com');
    expect(oldTokenCheck.status).toBe(401);

    // New token succeeds
    const newTokenCheck = await request(app)
      .get(`/api/v1/public/widgets/${widgetId}`)
      .set('Authorization', `Bearer ${newWidgetToken}`)
      .set('Origin', 'https://myagency.com');
    expect(newTokenCheck.status).toBe(200);
  });
});
