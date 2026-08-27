import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@leadguard/database';
import { agencyOverviewService } from '../../apps/api/src/services/agency/agencyOverviewService.js';

describe('Phase 7.2 — Agency Metrics Redis Caching', () => {
  let org: any;

  beforeAll(async () => {
    org = await db.organization.create({
      data: {
        name: 'Metrics Cache Agency',
        slug: `metrics-cache-${Date.now()}`,
      },
    });

    await db.clientWorkspace.create({
      data: {
        organizationId: org.id,
        name: 'Client A',
        slug: `client-a-${Date.now()}`,
      },
    });
  });

  afterAll(async () => {
    await db.clientWorkspace.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
  });

  it('serves cached metrics on second call and refreshes upon invalidation', async () => {
    // 1. Initial overview computes metrics
    const data1 = await agencyOverviewService.getOverview(org.id);
    expect(data1.metrics.clients).toBe(1);

    // 2. Add another client without invalidating cache
    await db.clientWorkspace.create({
      data: {
        organizationId: org.id,
        name: 'Client B',
        slug: `client-b-${Date.now()}`,
      },
    });

    // Overview should return cached count (1)
    const data2 = await agencyOverviewService.getOverview(org.id);
    expect(data2.metrics.clients).toBe(1);

    // Invalidate cache
    await agencyOverviewService.invalidateMetricsCache(org.id);

    // Next overview should fetch updated count (2)
    const data3 = await agencyOverviewService.getOverview(org.id);
    expect(data3.metrics.clients).toBe(2);
  });
});
