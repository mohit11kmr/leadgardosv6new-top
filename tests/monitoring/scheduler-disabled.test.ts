import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { monitoringScheduler } from '../../apps/worker/src/monitoring/scheduler.js';

describe('Watchdog Scheduler: disabled/archived configs are never enqueued (Requirement 2, 3)', () => {
  async function createOrgAndWebsite(label: string) {
    const org = await db.organization.create({
      data: { name: `Sched Disabled ${label}`, slug: `sched-disabled-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: `${label} Site`,
        url: `https://${label.toLowerCase()}-disabled-sched.test`,
        normalizedUrl: `https://${label.toLowerCase()}-disabled-sched.test`,
        domain: `${label.toLowerCase()}-disabled-sched.test`,
      },
    });
    return { org, website };
  }

  // Exercises claimMonitorSlot() directly rather than the full
  // enqueueDueMonitors() sweep: that sweep's `take: 50` due-configs query,
  // ordered by nextRunAt, can be crowded out by unrelated leftover due
  // configs accumulated from other test files sharing this DB (a config's
  // nextRunAt only advances after a successful run) — a pre-existing
  // shared-fixture characteristic of this suite, not specific to these
  // tests. claimMonitorSlot() is the exact atomic primitive
  // enqueueDueMonitors() calls per due config — it independently re-checks
  // enabled/archivedAt itself (defense in depth alongside the outer sweep's
  // own findMany filter), so testing it directly still proves the same
  // enforcement without that ordering risk.

  it('does not claim a disabled monitoring config even when nextRunAt is due', async () => {
    const { org, website } = await createOrgAndWebsite('A');
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        enabled: false,
        nextRunAt: new Date(Date.now() - 60_000),
      },
    });

    const result = await monitoringScheduler.claimMonitorSlot(config.id, monitoringScheduler.getSlotKey());
    expect(result.claimed).toBe(false);

    const unchanged = await db.monitoringConfig.findUniqueOrThrow({ where: { id: config.id } });
    expect(unchanged.lockedUntil).toBeNull();
    expect(unchanged.lockToken).toBeNull();
  });

  it('does not claim an archived monitoring config even when enabled and due', async () => {
    const { org, website } = await createOrgAndWebsite('B');
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        enabled: true,
        archivedAt: new Date(),
        nextRunAt: new Date(Date.now() - 60_000),
      },
    });

    const result = await monitoringScheduler.claimMonitorSlot(config.id, monitoringScheduler.getSlotKey());
    expect(result.claimed).toBe(false);

    const unchanged = await db.monitoringConfig.findUniqueOrThrow({ where: { id: config.id } });
    expect(unchanged.lockedUntil).toBeNull();
  });

  it('claims an enabled, non-archived config (positive control for the two negative cases above)', async () => {
    const { org, website } = await createOrgAndWebsite('C');
    const config = await db.monitoringConfig.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        frequency: 'HOURLY',
        enabled: true,
        nextRunAt: new Date(Date.now() - 60_000),
      },
    });

    const slot = monitoringScheduler.getSlotKey();
    const result = await monitoringScheduler.claimMonitorSlot(config.id, slot);
    expect(result.claimed).toBe(true);

    const claimed = await db.monitoringConfig.findUniqueOrThrow({ where: { id: config.id } });
    expect(claimed.lockedUntil).not.toBeNull();
    expect(claimed.lockToken).not.toBeNull();
  });
});
