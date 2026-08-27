import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import { ProspectService, validateSafeUrl } from '../../apps/api/src/services/agency/prospectService.js';

describe('Agency Platform: 500-Prospect Benchmark & Scalability (LG-022)', () => {
  let agencyOrg: any;
  let prospectService: ProspectService;

  beforeEach(async () => {
    prospectService = new ProspectService();

    agencyOrg = await db.organization.create({
      data: { name: 'Scale Benchmark Agency', slug: `scale-agency-${Date.now()}` },
    });

    let enterprisePlan = await db.plan.findUnique({ where: { code: 'ENTERPRISE' } });
    if (!enterprisePlan) {
      enterprisePlan = await db.plan.create({
        data: {
          code: 'ENTERPRISE',
          name: 'Enterprise Plan',
          priceInPaise: 1999900,
          currency: 'INR',
          entitlements: {
            auditsPerMonth: 10000,
            websites: 100,
            monitoring: true,
            apiAccess: true,
            whiteLabel: true,
            reports: 5000,
            prospectLimit: 50000,
            clientLimit: 100,
            prospectCampaignLimit: 250,
            prospectLimitPerCampaign: 2500,
            pitchLimit: 5000,
            widgetLimit: 50,
            competitorLimit: 50,
          },
        },
      });
    }

    await db.subscription.create({
      data: {
        organizationId: agencyOrg.id,
        planId: enterprisePlan.id,
        status: 'ACTIVE',
        provider: 'RAZORPAY',
        providerSubscriptionId: `sub_enterprise_${Date.now()}`,
      },
    });
  });

  it('benchmarks URL validation throughput for 500 candidates', async () => {
    const urls = Array.from({ length: 500 }, (_, i) => `https://candidate-business-${i}.com/services`);
    const start = performance.now();

    const results = await Promise.all(urls.map((u) => validateSafeUrl(u)));
    const validCount = results.filter((r) => r.isValid).length;

    const duration = performance.now() - start;
    expect(validCount).toBe(500);
    expect(duration).toBeLessThan(5000); // Async URL & domain validations under 5s for 500 items
  });

  it('benchmarks campaign creation and ingestion for 10, 100, and 500 prospects', async () => {
    // 10 prospects
    const t10Start = performance.now();
    const camp10 = await prospectService.createCampaign(agencyOrg.id, {
      name: 'Benchmark 10 Prospects',
      sourceType: 'MANUAL',
      items: Array.from({ length: 10 }, (_, i) => ({ url: `https://business-10-${i}.com` })),
    });
    const t10Duration = performance.now() - t10Start;
    expect(camp10.targetCount).toBe(10);
    expect(t10Duration).toBeLessThan(1000);

    // 100 prospects
    const t100Start = performance.now();
    const camp100 = await prospectService.createCampaign(agencyOrg.id, {
      name: 'Benchmark 100 Prospects',
      sourceType: 'MANUAL',
      items: Array.from({ length: 100 }, (_, i) => ({ url: `https://business-100-${i}.com` })),
    });
    const t100Duration = performance.now() - t100Start;
    expect(camp100.targetCount).toBe(100);
    expect(t100Duration).toBeLessThan(2000);

    // 500 prospects boundary
    const t500Start = performance.now();
    const camp500 = await prospectService.createCampaign(agencyOrg.id, {
      name: 'Benchmark 500 Prospects',
      sourceType: 'MANUAL',
      items: Array.from({ length: 500 }, (_, i) => ({ url: `https://business-500-${i}.com` })),
    });
    const t500Duration = performance.now() - t500Start;
    expect(camp500.targetCount).toBe(500);
    expect(t500Duration).toBeLessThan(5000); // Ingests 500 records under 5s
  });
});
