import 'dotenv/config';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { processAudit } from './audit.js';
import { processMonitoringJob, type MonitoringJobData } from './monitoring/index.js';
import { processVaultScan } from './audit/vaultScan.js';
import { prospectWorker } from './agency/prospectWorker.js';
import { competitorWorker } from './agency/competitorWorker.js';
import { pitchWorker } from './agency/pitchWorker.js';
import { pdfWorker } from './report/pdfWorker.js';
import { webhookWorker } from './webhook/webhookWorker.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const auditWorker = new Worker(
  'audit',
  async (job) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      return await processAudit(job.data.auditId as string, controller.signal, job.data.options);
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

console.log('LeadGuard worker listening');

const vaultWorker = new Worker(
  'vault',
  async (job) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.MAX_VAULT_DURATION_MS ?? 120_000));
    try {
      return await processVaultScan(job.data.runId as string, controller.signal, job.data.options);
    } finally {
      clearTimeout(timer);
    }
  },
  { connection, concurrency: Number(process.env.VAULT_CONCURRENCY ?? 2) }
);

vaultWorker.on('failed', (job, error) =>
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'worker',
      event: 'vault_failed',
      jobId: job?.id,
      error: error.message,
    })
  )
);

const handleWorkerShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down BullMQ workers gracefully...`);
  try {
    await Promise.allSettled([
      auditWorker.close(),
      monitoringWorker.close(),
      vaultWorker.close(),
      prospectWorker.close(),
      competitorWorker.close(),
      pitchWorker.close(),
      pdfWorker.close(),
      webhookWorker.close(),
    ]);
    console.log('All BullMQ workers stopped accepting jobs and finished active work.');
    await connection.quit();
    console.log('Redis connection closed. Worker process exiting.');
    process.exit(0);
  } catch (err: any) {
    console.error('Error during graceful worker shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleWorkerShutdown('SIGTERM'));
process.on('SIGINT', () => handleWorkerShutdown('SIGINT'));
