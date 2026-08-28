import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { apiRouter } from '../../apps/api/src/routes.js';
import { createAccessToken, hashPassword } from '../../apps/api/src/auth.js';
import {
  pitchService,
  TemplateAIProvider,
  GeminiProvider,
} from '../../apps/api/src/services/agency/pitchService.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api/v1', apiRouter);

describe('Agency Platform: Grounded AI Cold Pitch Generator (LG-023)', () => {
  let agencyOrg: any;
  let user: any;
  let token: string;
  let campaign: any;

  beforeEach(async () => {
    pitchService.setProvider(new TemplateAIProvider());

    const email = `pitch.tester.${Date.now()}.${Math.random()}@leadguard.test`;
    user = await db.user.create({
      data: { email, passwordHash: await hashPassword('Password123456!') },
    });
    agencyOrg = await db.organization.create({
      data: { name: 'Pitch Mastery Agency', slug: `pitch-agency-${Date.now()}-${Math.random()}` },
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
        providerSubscriptionId: `sub_pitch_${Date.now()}_${Math.random()}`,
      },
    });

    campaign = await db.prospectCampaign.create({
      data: {
        organizationId: agencyOrg.id,
        name: 'Chiropractic Campaign',
        source: 'MANUAL',
        targetCount: 2,
        status: 'COMPLETED',
      },
    });

    token = createAccessToken(user.id, agencyOrg.id);
  });

  it('enqueues asynchronous pitch generation job and returns 202 Accepted', async () => {
    const prospect = await db.prospect.create({
      data: {
        campaignId: campaign.id,
        organizationId: agencyOrg.id,
        url: 'https://apexchiro.com',
        normalizedUrl: `https://apexchiro.com/?t=${Date.now()}`,
        domain: 'apexchiro.com',
        businessName: 'Apex Chiropractic',
        leadScore: 58,
        criticalFindings: 2,
        highFindings: 3,
        status: 'AUDITED',
      },
    });

    const res = await request(app)
      .post(`/api/v1/agency/prospects/${prospect.id}/pitches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tone: 'DIRECT', language: 'en' });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data.generationId).toBeDefined();
    expect(res.body.data.status).toBe('QUEUED');

    const generationId = res.body.data.generationId;

    // Process job with pitchService
    await pitchService.processGenerationJob({
      generationId,
      organizationId: agencyOrg.id,
      prospectId: prospect.id,
      tone: 'DIRECT',
      language: 'en',
    });

    // Poll generation status
    const statusRes = await request(app)
      .get(`/api/v1/agency/prospects/${prospect.id}/pitches/generations/${generationId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('COMPLETED');
    expect(statusRes.body.data.pitch).toBeDefined();
    expect(statusRes.body.data.pitch.subject).toContain('apexchiro.com');
    expect(statusRes.body.data.pitch.subject).toContain('58/100');
    expect(statusRes.body.data.pitch.provider).toBe('DETERMINISTIC_TEMPLATE');
    expect(statusRes.body.data.pitch.version).toBe(1);
  });

  it('fails with NO_VERIFIED_FINDINGS if prospect has no verified score or audit data', async () => {
    const emptyProspect = await db.prospect.create({
      data: {
        campaignId: campaign.id,
        organizationId: agencyOrg.id,
        url: 'https://unscored-site.com',
        normalizedUrl: `https://unscored-site.com/?t=${Date.now()}`,
        domain: 'unscored-site.com',
        leadScore: null,
        status: 'DISCOVERED',
      },
    });

    const initRes = await request(app)
      .post(`/api/v1/agency/prospects/${emptyProspect.id}/pitches`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tone: 'DIRECT' });

    expect(initRes.status).toBe(202);
    const generationId = initRes.body.data.generationId;

    await expect(
      pitchService.processGenerationJob({
        generationId,
        organizationId: agencyOrg.id,
        prospectId: emptyProspect.id,
      })
    ).rejects.toThrow(/No verified audit findings or diagnostic score/);

    const statusRes = await request(app)
      .get(`/api/v1/agency/prospects/${emptyProspect.id}/pitches/generations/${generationId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(statusRes.body.data.status).toBe('FAILED');
  });

  it('GeminiProvider throws AI_PROVIDER_NOT_CONFIGURED when API key is missing', async () => {
    const gemini = new GeminiProvider('gemini-1.5-flash', '');
    await expect(
      gemini.generatePitch({
        domain: 'example.com',
        leadScore: 70,
        criticalFindingsCount: 1,
        highFindingsCount: 1,
        verifiedFindings: [],
        tone: 'PROFESSIONAL',
        language: 'en',
      })
    ).rejects.toThrow(/Gemini API key is not configured/);
  });

  it('increments version on regeneration without overwriting previous pitch history', async () => {
    const regenProspect = await db.prospect.create({
      data: {
        campaignId: campaign.id,
        organizationId: agencyOrg.id,
        url: 'https://regen-target.com',
        normalizedUrl: `https://regen-target.com/?t=${Date.now()}`,
        domain: 'regen-target.com',
        leadScore: 75,
        criticalFindings: 1,
        highFindings: 1,
        status: 'AUDITED',
      },
    });

    // 1st generation
    const gen1 = await pitchService.enqueuePitchGeneration(agencyOrg.id, regenProspect.id, { tone: 'PROFESSIONAL' });
    await pitchService.processGenerationJob({
      generationId: gen1.generationId,
      organizationId: agencyOrg.id,
      prospectId: regenProspect.id,
      tone: 'PROFESSIONAL',
    });

    // 2nd generation (Regeneration)
    const gen2 = await pitchService.enqueuePitchGeneration(agencyOrg.id, regenProspect.id, { tone: 'DIRECT' });
    await pitchService.processGenerationJob({
      generationId: gen2.generationId,
      organizationId: agencyOrg.id,
      prospectId: regenProspect.id,
      tone: 'DIRECT',
    });

    const pitchesRes = await request(app)
      .get(`/api/v1/agency/prospects/${regenProspect.id}/pitches`)
      .set('Authorization', `Bearer ${token}`);

    expect(pitchesRes.status).toBe(200);
    expect(pitchesRes.body.data.length).toBeGreaterThanOrEqual(2);
    expect(pitchesRes.body.data[0].version).toBeGreaterThanOrEqual(2);
  });
});
