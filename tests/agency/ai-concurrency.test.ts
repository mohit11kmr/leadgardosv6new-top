import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@leadguard/database';
import { PitchService } from '../../apps/api/src/services/agency/pitchService.js';

describe('Phase 7.2 — AI Pitch Concurrency & Versioning Race Hardening', () => {
  let org: any;
  let campaign: any;
  let prospect: any;
  const pitchService = new PitchService();

  beforeAll(async () => {
    org = await db.organization.create({
      data: {
        name: 'Concurrency Test Agency Org',
        slug: `conc-agency-${Date.now()}`,
      },
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
        organizationId: org.id,
        planId: agencyPlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_conc_${Date.now()}`,
      },
    });

    campaign = await db.prospectCampaign.create({
      data: {
        organizationId: org.id,
        name: 'Concurrency Campaign',
        status: 'DRAFT',
      },
    });

    prospect = await db.prospect.create({
      data: {
        organizationId: org.id,
        campaignId: campaign.id,
        url: 'https://concurrency-test.com',
        normalizedUrl: 'https://concurrency-test.com',
        domain: 'concurrency-test.com',
        businessName: 'Concurrency Test Inc',
        leadScore: 65,
        criticalFindings: 1,
        highFindings: 0,
        status: 'AUDITED',
      },
    });
  });

  afterAll(async () => {
    await db.pitch.deleteMany({ where: { organizationId: org.id } });
    await db.pitchGeneration.deleteMany({ where: { organizationId: org.id } });
    await db.prospect.deleteMany({ where: { organizationId: org.id } });
    await db.prospectCampaign.deleteMany({ where: { organizationId: org.id } });
    await db.subscription.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
  });

  it('handles concurrent enqueue requests with identical idempotencyKey safely without creating duplicate generations', async () => {
    const idempotencyKey = `idem_${Date.now()}`;

    // Execute 3 simultaneous enqueue requests with the same idempotency key
    const [res1, res2, res3] = await Promise.all([
      pitchService.enqueuePitchGeneration(org.id, prospect.id, { idempotencyKey }),
      pitchService.enqueuePitchGeneration(org.id, prospect.id, { idempotencyKey }),
      pitchService.enqueuePitchGeneration(org.id, prospect.id, { idempotencyKey }),
    ]);

    // All should return the exact same generationId
    expect(res1.generationId).toBeDefined();
    expect(res2.generationId).toBe(res1.generationId);
    expect(res3.generationId).toBe(res1.generationId);

    const count = await db.pitchGeneration.count({
      where: { organizationId: org.id, idempotencyKey },
    });
    expect(count).toBe(1);
  });

  it('atomically increments pitch versions without collisions', async () => {
    // Generate Version 1
    const gen1 = await pitchService.enqueuePitchGeneration(org.id, prospect.id);
    await pitchService.processGenerationJob({
      generationId: gen1.generationId,
      organizationId: org.id,
      prospectId: prospect.id,
    });

    // Generate Version 2
    const gen2 = await pitchService.enqueuePitchGeneration(org.id, prospect.id);
    await pitchService.processGenerationJob({
      generationId: gen2.generationId,
      organizationId: org.id,
      prospectId: prospect.id,
    });

    const pitches = await pitchService.listPitches(org.id, prospect.id);
    expect(pitches.length).toBeGreaterThanOrEqual(2);

    const versions = pitches.map((p) => p.version);
    expect(versions).toContain(1);
    expect(versions).toContain(2);

    // Verify versions are strictly unique for this prospect
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(versions.length);
  });
});
