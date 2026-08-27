import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '@leadguard/database';
import { config } from '@leadguard/config';
import { scannerRegistry, calculateScores, type Finding } from '@leadguard/shared';
import { BoundedCrawler } from '../audit/crawler.js';

const redisConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

interface SiteBenchmark {
  url: string;
  score: number;
  criticalCount: number;
  hasWhatsApp: boolean;
  hasCta: boolean;
  responseTimeMs: number;
}

export async function processCompetitorComparisonJob(job: Job<{ comparisonId: string; organizationId: string }>) {
  const { comparisonId, organizationId } = job.data;

  const comparison = await db.competitorComparison.findFirst({
    where: { id: comparisonId, organizationId },
  });

  if (!comparison) return { status: 'SKIPPED' };

  await db.competitorComparison.update({
    where: { id: comparisonId },
    data: { status: 'RUNNING' },
  });

  const crawler = new BoundedCrawler({
    maxPages: 1,
    maxDepth: 0,
    concurrencyLimit: 2,
    perRequestTimeoutMs: 8000,
    globalTimeoutMs: 15000,
  });

  const abortController = new AbortController();

  async function analyzeSite(targetUrl: string): Promise<SiteBenchmark> {
    try {
      const crawl = await crawler.crawl(targetUrl, abortController.signal);
      const page = crawl.pages.get(targetUrl) || Array.from(crawl.pages.values())[0];
      if (!page || !page.htmlAvailable) {
        return { url: targetUrl, score: 50, criticalCount: 1, hasWhatsApp: false, hasCta: false, responseTimeMs: 1000 };
      }

      const scan = await scannerRegistry.runPageScanners(page);
      const findings = scan.findings;
      const scores = calculateScores(findings);

      const hasWhatsApp = page.html.includes('wa.me') || page.html.includes('whatsapp.com');
      const hasCta = /<form|<input|<button|call-to-action/i.test(page.html);
      const criticalCount = findings.filter((f: Finding) => f.severity === 'CRITICAL').length;

      return {
        url: targetUrl,
        score: scores.overall,
        criticalCount,
        hasWhatsApp,
        hasCta,
        responseTimeMs: page.responseTimeMs,
      };
    } catch {
      return { url: targetUrl, score: 50, criticalCount: 1, hasWhatsApp: false, hasCta: false, responseTimeMs: 1000 };
    }
  }

  const targetBenchmark = await analyzeSite(comparison.targetUrl);
  const competitorBenchmarks: SiteBenchmark[] = [];

  for (const compUrl of comparison.competitorUrls) {
    const b = await analyzeSite(compUrl);
    competitorBenchmarks.push(b);
  }

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];

  const avgCompetitorScore = competitorBenchmarks.reduce((a, b) => a + b.score, 0) / competitorBenchmarks.length;

  if (targetBenchmark.score > avgCompetitorScore) {
    strengths.push(`Higher overall conversion readiness score (${targetBenchmark.score}) vs competitor average (${Math.round(avgCompetitorScore)})`);
  } else {
    weaknesses.push(`Overall conversion health score (${targetBenchmark.score}) lags behind competitors (${Math.round(avgCompetitorScore)})`);
  }

  if (targetBenchmark.hasWhatsApp && competitorBenchmarks.some((c) => !c.hasWhatsApp)) {
    strengths.push('Active WhatsApp direct lead channel while some competitors lack fast chat');
  } else if (!targetBenchmark.hasWhatsApp && competitorBenchmarks.some((c) => c.hasWhatsApp)) {
    opportunities.push('Add WhatsApp 1-click chat to match competitor lead response rates');
  }

  if (targetBenchmark.responseTimeMs < 500) {
    strengths.push(`Fast response time (${targetBenchmark.responseTimeMs}ms) outperforms average`);
  } else {
    weaknesses.push(`Server response time (${targetBenchmark.responseTimeMs}ms) could be improved for mobile conversions`);
  }

  const comparisonData = {
    target: targetBenchmark,
    competitors: competitorBenchmarks,
  };

  await db.competitorComparison.update({
    where: { id: comparisonId },
    data: {
      status: 'COMPLETED',
      comparisonData: comparisonData as object,
      strengths: strengths as object,
      weaknesses: weaknesses as object,
      opportunities: opportunities as object,
      lastRunAt: new Date(),
    },
  });

  return { status: 'COMPLETED', comparisonData };
}

export const competitorWorker = new Worker(
  'agency-competitor',
  async (job) => processCompetitorComparisonJob(job),
  {
    connection: redisConnection,
    concurrency: 2,
  }
);
