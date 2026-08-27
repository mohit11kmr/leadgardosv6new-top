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

        if (isQualified) qualifiedCount++;
      } else {
        await db.prospect.update({
          where: { id: prospect.id },
          data: {
            leadScore: 40,
            criticalFindings: 1,
            status: 'AUDITED',
            lastCheckedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.warn(`[ProspectWorker] Failed to audit prospect ${prospect.url}:`, err);
    }

    processedCount++;
    await db.prospectCampaign.update({
      where: { id: campaignId },
      data: { processedCount, qualifiedCount },
    });
  }

  await db.prospectCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      processedCount,
      qualifiedCount,
    },
  });

  return { status: 'COMPLETED', processedCount, qualifiedCount };
}

export const prospectWorker = new Worker(
  'agency-prospect',
  async (job) => processProspectCampaignJob(job),
  {
    connection: redisConnection,
    concurrency: 2,
  }
);
