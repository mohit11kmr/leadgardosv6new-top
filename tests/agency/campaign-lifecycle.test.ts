import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import { ProspectService } from '../../apps/api/src/services/agency/prospectService.js';
import { processProspectCampaignJob } from '../../apps/worker/src/agency/prospectWorker.js';

describe('Agency Platform: Campaign Lifecycle, Deduplication & Partial Failures', () => {
  let agencyOrg: any;
  let prospectService: ProspectService;

  beforeEach(async () => {
    prospectService = new ProspectService();

    agencyOrg = await db.organization.create({
      data: { name: 'Lifecycle Agency', slug: `lifecycle-agency-${Date.now()}` },
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
        providerSubscriptionId: `sub_lifecycle_${Date.now()}`,
      },
    });
  });

  it('deduplicates duplicate candidate URLs within the same campaign', async () => {
    const items = [
      { url: 'https://site-a.com' },
      { url: 'https://site-a.com/' }, // Normalized to identical URL
      { url: 'https://site-b.com' },
    ];

    const campaign = await prospectService.createCampaign(agencyOrg.id, {
      name: 'Dedup Campaign',
      sourceType: 'MANUAL',
      items,
    });

    const prospects = await db.prospect.findMany({
      where: { campaignId: campaign.id },
    });

    // Exactly 2 unique prospects inserted (site-a deduplicated)
    expect(prospects.length).toBe(2);
    expect(campaign.targetCount).toBe(2);
  });

  it('worker tracks partial failures and updates campaign status to COMPLETED or PARTIAL', async () => {
    const campaign = await db.prospectCampaign.create({
      data: {
        organizationId: agencyOrg.id,
        name: 'Partial Failure Test Campaign',
        source: 'MANUAL',
        targetCount: 2,
        status: 'QUEUED',
      },
    });

    // 1 valid mock candidate + 1 unreachable candidate
    await db.prospect.createMany({
      data: [
        {
          campaignId: campaign.id,
          organizationId: agencyOrg.id,
          url: 'https://valid-target-domain.com',
          normalizedUrl: 'https://valid-target-domain.com/',
          domain: 'valid-target-domain.com',
          status: 'DISCOVERED',
        },
        {
          campaignId: campaign.id,
          organizationId: agencyOrg.id,
          url: 'https://unreachable-timeout-domain-9999.com',
          normalizedUrl: 'https://unreachable-timeout-domain-9999.com/',
          domain: 'unreachable-timeout-domain-9999.com',
          status: 'DISCOVERED',
        },
      ],
    });

    const job = {
      data: { campaignId: campaign.id, organizationId: agencyOrg.id },
    } as any;

    const result = await processProspectCampaignJob(job);
    expect(result.processedCount).toBe(2);

    const updated = await db.prospectCampaign.findUnique({
      where: { id: campaign.id },
    });

    expect(['COMPLETED', 'PARTIAL']).toContain(updated?.status);
    expect(updated?.completedAt).toBeDefined();
  }, 30000);
});
