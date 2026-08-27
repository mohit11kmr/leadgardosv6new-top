import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '@leadguard/database';
import { config } from '@leadguard/config';
import { scannerRegistry, calculateScores, type Finding } from '@leadguard/shared';
import { BoundedCrawler } from '../audit/crawler.js';

const redisConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export async function processProspectCampaignJob(job: Job<{ campaignId: string; organizationId: string }>) {
  const { campaignId, organizationId } = job.data;

  const campaign = await db.prospectCampaign.findFirst({
    where: { id: campaignId, organizationId },
    include: { prospects: true },
  });

  if (!campaign || campaign.status === 'CANCELLED') {
    return { status: 'SKIPPED' };
  }

  await db.prospectCampaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING' },
  });

  let processedCount = 0;
  let successfulCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let qualifiedCount = 0;

  const crawler = new BoundedCrawler({
    maxPages: 1,
    maxDepth: 0,
    concurrencyLimit: 2,
    perRequestTimeoutMs: 6000,
    globalTimeoutMs: 12000,
  });

  const abortController = new AbortController();

  for (const prospect of campaign.prospects) {
    // Check if campaign was paused or cancelled mid-execution
    const liveCampaign = await db.prospectCampaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (liveCampaign?.status === 'CANCELLED') {
      return { status: 'CANCELLED', processedCount, successfulCount, failedCount, skippedCount };
    }

    if (liveCampaign?.status === 'PAUSED') {
      return { status: 'PAUSED', processedCount, successfulCount, failedCount, skippedCount };
    }

    try {
      const crawlResult = await crawler.crawl(prospect.normalizedUrl, abortController.signal);
      const rootPage = crawlResult.pages.get(prospect.normalizedUrl) || Array.from(crawlResult.pages.values())[0];

      if (rootPage && rootPage.htmlAvailable) {
        const scan = await scannerRegistry.runPageScanners(rootPage);
        const findings = scan.findings;
        const criticalCount = findings.filter((f: Finding) => f.severity === 'CRITICAL').length;
        const highCount = findings.filter((f: Finding) => f.severity === 'HIGH').length;

        const scores = calculateScores(findings);
        const leadScore = scores.overall;
        const isQualified = leadScore < 80 || criticalCount > 0 || highCount > 1;

        await db.prospect.update({
          where: { id: prospect.id },
          data: {
            leadScore,
            criticalFindings: criticalCount,
            highFindings: highCount,
            status: isQualified ? 'QUALIFIED' : 'AUDITED',
            lastCheckedAt: new Date(),
          },
        });

        successfulCount++;
        if (isQualified) qualifiedCount++;
      } else {
        // Root page could not be fetched or HTML unavailable
        await db.prospect.update({
          where: { id: prospect.id },
          data: {
            leadScore: 50,
            status: 'AUDITED',
            lastCheckedAt: new Date(),
          },
        });
        skippedCount++;
      }
    } catch (err) {
      console.warn(`[ProspectWorker] Failed to audit prospect ${prospect.url}:`, err);
      failedCount++;
    }

    processedCount++;
    await db.prospectCampaign.update({
      where: { id: campaignId },
      data: {
        processedCount,
        successfulCount,
        failedCount,
        skippedCount,
        qualifiedCount,
      },
    });
  }

  let finalStatus = 'COMPLETED';
  if (failedCount > 0 && successfulCount === 0) {
    finalStatus = 'FAILED';
  } else if (failedCount > 0) {
    finalStatus = 'PARTIAL';
  }

  await db.prospectCampaign.update({
    where: { id: campaignId },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      processedCount,
      successfulCount,
      failedCount,
      skippedCount,
      qualifiedCount,
    },
  });

  return { status: finalStatus, processedCount, successfulCount, failedCount, skippedCount, qualifiedCount };
}

export const prospectWorker = new Worker(
  'agency-prospect',
  async (job) => processProspectCampaignJob(job),
  {
    connection: redisConnection,
    concurrency: 2,
  }
);
