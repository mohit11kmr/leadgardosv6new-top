import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const monitoringQueue = new Queue('monitoring', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export class MonitoringScheduler {
  private timer: NodeJS.Timeout | null = null;

  async enqueueDueMonitors(): Promise<number> {
    const now = new Date();
    const dueConfigs = await db.monitoringConfig.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: { lte: now } }, { nextRunAt: null }],
      },
      take: 50,
    });

    let enqueued = 0;
    for (const item of dueConfigs) {
      const jobId = `mon_${item.id}_${Math.floor(Date.now() / 60000)}`;
      await monitoringQueue.add(
        'execute-monitor',
        { monitoringConfigId: item.id, triggeredBy: 'SCHEDULER' },
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
