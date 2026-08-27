import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import { validateSafeUrl, CsvProspectSource } from '../../apps/api/src/services/agency/prospectService.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: 500-Site Prospect Hunter (LG-022)', () => {
  let agencyOrg: any;
  let user: any;
  let token: string;

  beforeEach(async () => {
    const email = `prospect.tester.${Date.now()}@leadguard.test`;
    user = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    agencyOrg = await db.organization.create({
      data: { name: 'Growth Agency', slug: `growth-agency-${Date.now()}` },
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
        providerSubscriptionId: `sub_growth_${Date.now()}`,
      },
    });

    token = createAccessToken(user.id, agencyOrg.id);
  });

  it('strictly rejects SSRF targets and private IP addresses', () => {
    expect(validateSafeUrl('http://localhost:3000').isValid).toBe(false);
    expect(validateSafeUrl('http://127.0.0.1/admin').isValid).toBe(false);
    expect(validateSafeUrl('http://169.254.169.254/latest/meta-data').isValid).toBe(false);
    expect(validateSafeUrl('http://10.0.0.5/internal').isValid).toBe(false);
    expect(validateSafeUrl('http://192.168.1.1/router').isValid).toBe(false);
    expect(validateSafeUrl('http://172.20.0.1/db').isValid).toBe(false);

    const valid = validateSafeUrl('https://exampleclinic.com');
    expect(valid.isValid).toBe(true);
    expect(valid.domain).toBe('exampleclinic.com');
  });

  it('parses CSV prospect lists and creates campaign with validated URLs', async () => {
    const csvData = `url,businessName,industry,location
https://austindental.com,Austin Dental,Healthcare,Austin TX
https://bostondental.com,Boston Dental,Healthcare,Boston MA
http://localhost:8080,Malicious SSRF,Tech,Local
https://seattledental.com,Seattle Dental,Healthcare,Seattle WA`;

    const source = new CsvProspectSource(csvData);
    const extracted = await source.extract();
    expect(extracted.length).toBe(4);

    const createRes = await request(app)
      .post('/api/v1/agency/prospect-campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Dental Batch #1',
        sourceType: 'CSV',
        csvContent: csvData,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    // 3 valid sites ingested (localhost SSRF rejected)
    expect(createRes.body.data.targetCount).toBe(3);

    const campaignId = createRes.body.data.id;

    // Start campaign
    const startRes = await request(app)
      .post(`/api/v1/agency/prospect-campaigns/${campaignId}/start`)
      .set('Authorization', `Bearer ${token}`);

    expect(startRes.status).toBe(202);
    expect(startRes.body.data.enqueued).toBe(true);

    // Query prospects with pagination
    const prospectsRes = await request(app)
      .get(`/api/v1/agency/prospect-campaigns/${campaignId}/prospects`)
      .set('Authorization', `Bearer ${token}`);

    expect(prospectsRes.status).toBe(200);
    expect(prospectsRes.body.data.items.length).toBe(3);
    expect(prospectsRes.body.data.items[0].domain).toBeDefined();
  });
});
