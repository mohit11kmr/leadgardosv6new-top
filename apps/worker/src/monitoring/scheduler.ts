import { randomUUID } from 'crypto';
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

const RELEASE_LOCK_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

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
   * Safely releases a Redis distributed lock only if the caller owns the token.
   */
  async releaseRedisLock(lockKey: string, lockToken: string): Promise<boolean> {
    try {
      const result = await redisConnection.eval(RELEASE_LOCK_LUA, 1, lockKey, lockToken);
      return result === 1;
    } catch (err) {
      console.error(`[Scheduler] Failed to release Redis lock for key ${lockKey}:`, err);
      return false;
    }
  }

  /**
   * Claims a due monitor atomically using Redis lock ownership + DB lockedUntil update.
   * If DB claim fails, automatically releases the Redis lock to prevent orphaned locks.
   */
  async claimMonitorSlot(
    configId: string,
    slot: string
  ): Promise<{ claimed: boolean; lockToken?: string; lockKey?: string }> {
    const lockKey = `mon:lock:slot:${configId}:${slot}`;
    const lockToken = randomUUID();

    // 1. Acquire Redis distributed lock with ownership token (TTL: 600s)
    // 600s (10 min) TTL is sufficient because crawler execution completes in 1-5s (max 30s timeout),
    // and successful execution clears lockedUntil and sets nextRunAt.
    const acquired = await redisConnection.set(lockKey, lockToken, 'EX', 600, 'NX');
    if (!acquired) {
      return { claimed: false };
    }

    try {
      // 2. Atomic database claim update with lockToken tracking
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
          lockToken,
        },
      });

      if (updated.count === 0) {
        // DB claim failed (e.g. concurrent claim or archived) -> Release Redis lock immediately!
        await this.releaseRedisLock(lockKey, lockToken);
        return { claimed: false };
      }

      return { claimed: true, lockToken, lockKey };
    } catch (err) {
      // DB error -> Safe rollback of Redis lock
      await this.releaseRedisLock(lockKey, lockToken);
      console.error(`[Scheduler] Error during DB claim for config ${configId}:`, err);
      return { claimed: false };
    }
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
      orderBy: { nextRunAt: 'asc' },
      take: 50,
    });

    let enqueued = 0;
    for (const item of dueConfigs) {
      const claimResult = await this.claimMonitorSlot(item.id, slot);
      if (!claimResult.claimed || !claimResult.lockToken || !claimResult.lockKey) {
        continue;
      }

      const jobId = `mon_${item.id}_${slot}`;
      try {
        await monitoringQueue.add(
          'execute-monitor',
          {
            monitoringConfigId: item.id,
            triggeredBy: 'SCHEDULER',
            scheduledSlot: slot,
            expectedBaselineVersion: item.baselineVersion,
          },
          { jobId }
        );
        enqueued++;
      } catch (queueErr) {
        // Queue enqueue failure recovery:
        // Reset DB claim & release Redis lock so next scheduler cycle can recover
        console.error(`[Scheduler] Failed to enqueue job for monitor ${item.id}:`, queueErr);
        await db.monitoringConfig.update({
          where: { id: item.id },
          data: { lockedUntil: null, lockToken: null },
        }).catch((e) => console.error(`[Scheduler] DB claim reset error for ${item.id}:`, e));

        await this.releaseRedisLock(claimResult.lockKey, claimResult.lockToken);
      }
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
