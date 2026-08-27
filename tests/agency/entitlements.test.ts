import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Entitlements & Billing Plan Gating', () => {
  let freeOrg: any;
  let freeUser: any;
  let freeToken: string;

  beforeEach(async () => {
    const email = `free.agency.tester.${Date.now()}@leadguard.test`;
    freeUser = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    freeOrg = await db.organization.create({
      data: { name: 'Free Tier Org', slug: `free-org-${Date.now()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: freeOrg.id, userId: freeUser.id, role: 'OWNER' },
    });

    freeToken = createAccessToken(freeUser.id, freeOrg.id);
  });

  it('blocks free tier organizations from creating client workspaces', async () => {
    const res = await request(app)
      .post('/api/v1/agency/clients')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ name: 'Prohibited Workspace' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('blocks free tier organizations from creating prospect campaigns', async () => {
    const res = await request(app)
      .post('/api/v1/agency/prospect-campaigns')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({
        name: 'Prohibited Campaign',
        sourceType: 'MANUAL',
        items: [{ url: 'https://example.com' }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('blocks free tier organizations from creating widgets and competitor benchmarks', async () => {
    const widgetRes = await request(app)
      .post('/api/v1/agency/widgets')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ name: 'Prohibited Widget', allowedOrigins: ['https://example.com'] });

    expect(widgetRes.status).toBe(403);
    expect(widgetRes.body.error.code).toBe('PLAN_LIMIT_REACHED');

    const compRes = await request(app)
      .post('/api/v1/agency/competitors')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({
        name: 'Prohibited Radar',
        targetUrl: 'https://example.com',
        competitorUrls: ['https://competitor.com'],
      });

    expect(compRes.status).toBe(403);
    expect(compRes.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });
});
