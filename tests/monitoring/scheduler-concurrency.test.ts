import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { monitoringScheduler } from '../../apps/worker/src/monitoring/scheduler.js';

describe('Watchdog Scheduler: Distributed Locking & Concurrency Safety (Requirement 2, 3, 20)', () => {
  it('prevents duplicate enqueuing when 3 scheduler instances (A, B, C) claim the same due monitor slot', async () => {
    const org = await db.organization.create({
      data: { name: 'Scheduler 3 Org', slug: `sched-3-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Sched 3 Site',
        url: 'https://sched-3-site.test',
        normalizedUrl: 'https://sched-3-site.test',
        domain: 'sched-3-site.test',
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

    // 3 Scheduler instances (A, B, C) attempt to claim the exact same monitor in the same slot concurrently
    const [claimA, claimB, claimC] = await Promise.all([
      monitoringScheduler.claimMonitorSlot(config.id, slot),
      monitoringScheduler.claimMonitorSlot(config.id, slot),
      monitoringScheduler.claimMonitorSlot(config.id, slot),
    ]);

    // Exactly ONE instance must win the claim; the other two must be rejected
    const wins = [claimA.claimed, claimB.claimed, claimC.claimed].filter(Boolean).length;
    expect(wins).toBe(1);

    // Verify winner has a valid lockToken and lockKey
    const winner = [claimA, claimB, claimC].find((c) => c.claimed);
    expect(winner?.lockToken).toBeDefined();
    expect(winner?.lockKey).toBeDefined();
  });
});
