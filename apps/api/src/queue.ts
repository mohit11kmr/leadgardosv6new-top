import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const auditQueue = new Queue('audit', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const monitoringQueue = new Queue('monitoring', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
