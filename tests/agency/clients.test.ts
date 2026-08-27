import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Client Workspaces & Tenant Isolation (LG-024)', () => {
  let agencyAOrg: any;
  let agencyBOrg: any;
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    // 1. Create Agency A with active Agency subscription
    const emailA = `agency.a.${Date.now()}@leadguard.test`;
    userA = await db.user.create({
      data: { email: emailA, passwordHash: await hashPassword('Password123456!') },
    });
    agencyAOrg = await db.organization.create({
      data: { name: 'Alpha Agency', slug: `alpha-agency-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: agencyAOrg.id, userId: userA.id, role: 'OWNER' },
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
        organizationId: agencyAOrg.id,
        planId: agencyPlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_agency_a_${Date.now()}`,
      },
    });

    // 2. Create Agency B with Free subscription
    const emailB = `agency.b.${Date.now()}@leadguard.test`;
    userB = await db.user.create({
      data: { email: emailB, passwordHash: await hashPassword('Password123456!') },
    });
    agencyBOrg = await db.organization.create({
      data: { name: 'Beta Agency', slug: `beta-agency-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: agencyBOrg.id, userId: userB.id, role: 'OWNER' },
    });

    tokenA = createAccessToken(userA.id, agencyAOrg.id);
    tokenB = createAccessToken(userB.id, agencyBOrg.id);
  });

  it('creates client workspace and attaches website successfully', async () => {
    // Create client workspace under Agency A
    const createRes = await request(app)
      .post('/api/v1/agency/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Apex Dental Care',
        contactName: 'Dr. John Apex',
        contactEmail: 'contact@apexdental.com',
        notes: 'Priority onboarding',
        branding: {
          companyName: 'Apex Dental',
          supportEmail: 'care@apexdental.com',
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.name).toBe('Apex Dental Care');
    const clientId = createRes.body.data.id;

    // Create website under Agency A
    const website = await db.website.create({
      data: {
        organizationId: agencyAOrg.id,
        name: 'Apex Clinic Site',
        url: `https://apexdental-${Date.now()}.com`,
        normalizedUrl: `https://apexdental-${Date.now()}.com/`,
        domain: `apexdental-${Date.now()}.com`,
      },
    });

    // Assign website to client workspace
    const assignRes = await request(app)
      .post(`/api/v1/agency/clients/${clientId}/websites`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ websiteId: website.id });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.success).toBe(true);
    expect(assignRes.body.data.clientWorkspaceId).toBe(clientId);

    // List clients
    const listRes = await request(app)
      .get('/api/v1/agency/clients')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.length).toBe(1);
    expect(listRes.body.data.items[0].name).toBe('Apex Dental Care');
  });

  it('enforces strict cross-agency tenant isolation and blocks IDOR', async () => {
    // Agency A creates a client
    const createRes = await request(app)
      .post('/api/v1/agency/clients')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Confidential Client A' });

    const clientAId = createRes.body.data.id;

    // Agency B attempts to read Agency A's client
    const getRes = await request(app)
      .get(`/api/v1/agency/clients/${clientAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(getRes.status).toBe(404);

    // Agency B attempts to update Agency A's client
    const updateRes = await request(app)
      .patch(`/api/v1/agency/clients/${clientAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hacked Name' });

    expect(updateRes.status).toBe(500);

    // Agency B attempts to archive Agency A's client
    const deleteRes = await request(app)
      .delete(`/api/v1/agency/clients/${clientAId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(deleteRes.status).toBe(500);
  });
});
