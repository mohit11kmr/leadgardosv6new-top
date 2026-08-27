import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import { whiteLabelService } from '../../apps/api/src/services/agency/whiteLabelService.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: White-Label Reporting & Branding Hierarchy (LG-026)', () => {
  let agencyOrg: any;
  let user: any;
  let token: string;
  let report: any;

  beforeEach(async () => {
    const email = `whitelabel.tester.${Date.now()}@leadguard.test`;
    user = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    agencyOrg = await db.organization.create({
      data: { name: 'Titan Marketing Agency', slug: `titan-agency-${Date.now()}` },
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
        providerSubscriptionId: `sub_titan_${Date.now()}`,
      },
    });

    const client = await db.clientWorkspace.create({
      data: {
        organizationId: agencyOrg.id,
        name: 'Horizon Dental',
        slug: `horizon-dental-${Date.now()}`,
        branding: {
          companyName: 'Horizon Dental Group',
          supportEmail: 'info@horizondental.com',
          primaryColor: '#0ea5e9',
          footer: 'Confidential Audit for Horizon Dental Group',
        },
      },
    });

    const website = await db.website.create({
      data: {
        organizationId: agencyOrg.id,
        clientWorkspaceId: client.id,
        name: 'Horizon Clinic',
        url: 'https://horizondental.com',
        normalizedUrl: 'https://horizondental.com/',
        domain: 'horizondental.com',
      },
    });

    const audit = await db.audit.create({
      data: {
        organizationId: agencyOrg.id,
        websiteId: website.id,
        status: 'COMPLETED',
        scoringVersion: 'v3',
      },
    });

    await db.auditScore.create({
      data: {
        auditId: audit.id,
        lead: 85,
        advertising: 90,
        seo: 80,
        security: 95,
        overall: 87,
      },
    });

    report = await db.report.create({
      data: {
        organizationId: agencyOrg.id,
        auditId: audit.id,
      },
    });

    token = createAccessToken(user.id, agencyOrg.id);
  });

  it('resolves branding hierarchy and renders white-label HTML report', async () => {
    const res = await request(app)
      .get(`/api/v1/agency/reports/${report.id}/preview`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Horizon Dental Group');
    expect(res.text).toContain('87/100');
    expect(res.text).toContain('Confidential Audit for Horizon Dental Group');
    expect(res.text).toContain('#0ea5e9'); // Custom client branding color
  });
});
