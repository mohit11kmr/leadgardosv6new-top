import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { processAudit } from './audit.js';
import { processMonitoringJob, type MonitoringJobData } from './monitoring/index.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const queueNames = [
  'audit',
  'audit-page',
  'audit-finalize',
  'monitoring',
  'report',
  'prospect',
  'email',
  'webhook',
  'billing-webhook',
  'billing-reconciliation',
  'cleanup',
] as const;

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

export const billingWebhookQueue = new Queue('billing-webhook', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const billingReconciliationQueue = new Queue('billing-reconciliation', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 50,
    removeOnFail: 50,
  },
});

const auditWorker = new Worker(
  'audit',
  async (job) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      return await processAudit(job.data.auditId as string, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  },
  { connection, concurrency: Number(process.env.AUDIT_CONCURRENCY ?? 2) }
);

auditWorker.on('failed', (job, error) =>
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'worker',
      event: 'audit_failed',
      jobId: job?.id,
      error: error.message,
    })
  )
);

const monitoringWorker = new Worker(
  'monitoring',
  async (job) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      return await processMonitoringJob(job.data as MonitoringJobData, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  },
  { connection, concurrency: 2 }
);

monitoringWorker.on('failed', (job, error) =>
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'worker',
      event: 'monitoring_failed',
      jobId: job?.id,
      error: error.message,
    })
  )
);

const billingWebhookWorker = new Worker(
  'billing-webhook',
  async (job) => {
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'worker',
        event: 'billing_webhook_processed',
        jobId: job.id,
      })
    );
    return { processed: true, eventId: job.data.eventId };
  },
  { connection, concurrency: 2 }
);

billingWebhookWorker.on('failed', (job, error) =>
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'worker',
      event: 'billing_webhook_failed',
      jobId: job?.id,
      error: error.message,
    })
  )
);

console.log('LeadGuard worker listening');
