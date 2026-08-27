import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { monitoringScheduler } from '../../apps/worker/src/monitoring/scheduler.js';

describe('Watchdog Scheduler: Distributed Locking & Concurrency Safety (Requirement 2, 3, 29)', () => {
  it('prevents duplicate enqueuing when 2 scheduler instances claim the same due monitor slot', async () => {
    const org = await db.organization.create({
      data: { name: 'Scheduler Org', slug: `sched-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Sched Site',
        url: 'https://sched-site.test',
        normalizedUrl: 'https://sched-site.test',
        domain: 'sched-site.test',
      },
    });
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        enabled: true,
        nextRunAt: new Date(Date.now() - 60_000), // Due in the past
      },
    });

    const slot = monitoringScheduler.getSlotKey();

    // Instance A and Instance B both attempt to claim the exact same monitor in the same slot concurrently
    const [claimA, claimB] = await Promise.all([
      monitoringScheduler.claimMonitorSlot(config.id, slot),
      monitoringScheduler.claimMonitorSlot(config.id, slot),
    ]);

    // Exactly ONE instance must win the claim; the other must be rejected
    const wins = [claimA, claimB].filter(Boolean).length;
    expect(wins).toBe(1);
  });
});
