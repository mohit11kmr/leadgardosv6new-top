import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';

export const redisConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const monitoringQueue = new Queue('monitoring', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export class MonitoringScheduler {
  private timer: NodeJS.Timeout | null = null;

  /**
   * Generates a 5-minute bucket slot string for execution identity: YYYY-MM-DDTHH:mm
   */
  getSlotKey(date = new Date()): string {
    const d = new Date(date);
    d.setSeconds(0, 0);
    // Bucket to 5-minute granularity
    const minutes = Math.floor(d.getMinutes() / 5) * 5;
    d.setMinutes(minutes);
    return d.toISOString().slice(0, 16);
  }

  /**
   * Claims a due monitor atomically using Redis distributed lock + DB lockedUntil
   */
  async claimMonitorSlot(configId: string, slot: string): Promise<boolean> {
    const lockKey = `mon:lock:slot:${configId}:${slot}`;
    // Try to acquire distributed lock for 10 minutes (600 seconds)
    const acquired = await redisConnection.set(lockKey, '1', 'EX', 600, 'NX');
    if (!acquired) {
      return false;
    }

    // Atomic database claim update
    const lockExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const updated = await db.monitoringConfig.updateMany({
      where: {
        id: configId,
        archivedAt: null,
        enabled: true,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      },
      data: {
        lockedUntil: lockExpiry,
      },
    });

    return updated.count > 0;
  }

  async enqueueDueMonitors(): Promise<number> {
    const now = new Date();
    const slot = this.getSlotKey(now);

    const dueConfigs = await db.monitoringConfig.findMany({
      where: {
        enabled: true,
        archivedAt: null,
        OR: [{ nextRunAt: { lte: now } }, { nextRunAt: null }],
        AND: [
          {
            OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
          },
        ],
      },
      take: 50,
    });

    let enqueued = 0;
    for (const item of dueConfigs) {
      const claimed = await this.claimMonitorSlot(item.id, slot);
      if (!claimed) {
        continue;
      }

      const jobId = `mon_${item.id}_${slot}`;
      await monitoringQueue.add(
        'execute-monitor',
        {
          monitoringConfigId: item.id,
          triggeredBy: 'SCHEDULER',
          scheduledSlot: slot,
        },
        { jobId }
      );
      enqueued++;
    }

    return enqueued;
  }

  start(intervalMs = 30_000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.enqueueDueMonitors().catch((err) =>
        console.error('Scheduler error:', err)
      );
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const monitoringScheduler = new MonitoringScheduler();
