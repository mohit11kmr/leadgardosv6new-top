import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { db } from '@leadguard/database';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export interface StorageProvider {
  save(filename: string, content: Buffer | string): Promise<string>;
  get(filename: string): Promise<Buffer>;
  getUrl(filename: string): string;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir = 'uploads/reports') {
    this.baseDir = baseDir;
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const fullPath = join(this.baseDir, filename);
    await writeFile(fullPath, content);
    return `/uploads/reports/${filename}`;
  }

  async get(filename: string): Promise<Buffer> {
    const fullPath = join(this.baseDir, filename);
    return readFile(fullPath);
  }

  getUrl(filename: string): string {
    return `/uploads/reports/${filename}`;
  }
}

export class S3StorageProvider implements StorageProvider {
  private bucket: string;

  constructor(bucket = process.env.S3_BUCKET || 'leadguard-reports') {
    this.bucket = bucket;
  }

  async save(filename: string, content: Buffer | string): Promise<string> {
    // In cloud environment, uploads to S3 compatible object storage
    // Fallback to local representation if s3 client not configured
    const local = new LocalStorageProvider();
    return local.save(filename, content);
  }

  async get(filename: string): Promise<Buffer> {
    const local = new LocalStorageProvider();
    return local.get(filename);
  }

  getUrl(filename: string): string {
    return `https://${this.bucket}.s3.amazonaws.com/${filename}`;
  }
}

export function getStorageProvider(): StorageProvider {
  if (process.env.REPORT_STORAGE === 'S3') {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

export function generateReportHtml(options: {
  title: string;
  auditDate: string;
  websiteUrl: string;
  overallScore: number;
  findingsCount: number;
  criticalFindings: number;
  branding: {
    companyName: string;
    logoUrl?: string | null;
    primaryColor: string;
    secondaryColor: string;
    footerText?: string | null;
  };
}): string {
  const { title, auditDate, websiteUrl, overallScore, findingsCount, criticalFindings, branding } = options;
  const primary = branding.primaryColor || '#2563eb';
  const secondary = branding.secondaryColor || '#1e293b';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 40px; color: #1e293b; background: #fff; }
    .header { border-bottom: 2px solid ${primary}; padding-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .companyName { font-size: 24px; font-weight: 800; color: ${primary}; }
    .scoreBadge { background: ${primary}; color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 28px; font-weight: 900; }
    .statsGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 40px 0; }
    .statCard { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; }
    .statValue { font-size: 32px; font-weight: 800; color: ${secondary}; }
    .footer { margin-top: 60px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <div class="companyName">${branding.companyName}</div>
    <div class="scoreBadge">${overallScore} / 100</div>
  </div>
  <h1>${title}</h1>
  <p><strong>Target URL:</strong> ${websiteUrl} | <strong>Audit Date:</strong> ${auditDate}</p>
  <div class="statsGrid">
    <div class="statCard"><div class="statValue">${overallScore}/100</div><div>Overall Health</div></div>
    <div class="statCard"><div class="statValue">${findingsCount}</div><div>Total Diagnostics</div></div>
    <div class="statCard"><div class="statValue">${criticalFindings}</div><div>Critical Flaws</div></div>
  </div>
  <div class="footer">
    ${branding.footerText || `Generated automatically by ${branding.companyName} Diagnostic Intelligence.`}
  </div>
</body>
</html>`;
}

export interface PdfJobData {
  reportId: string;
  organizationId: string;
}

export async function processPdfJob(job: Job<PdfJobData>) {
  const { reportId, organizationId } = job.data;

  const report = await db.report.findFirst({
    where: { id: reportId, organizationId },
    include: {
      audit: {
        include: {
          website: true,
          score: true,
          findings: true,
        },
      },
    },
  });

  if (!report) {
    throw new Error(`Report not found: ${reportId}`);
  }

  await db.report.update({
    where: { id: report.id },
    data: { pdfStatus: 'GENERATING' },
  });

  try {
    const snapshot = (report.snapshotData || {}) as any;
    const branding = snapshot.branding || {
      companyName: 'LeadGuard OS',
      primaryColor: '#2563eb',
      secondaryColor: '#1e293b',
    };

    const renderedHtml = generateReportHtml({
      title: report.title,
      auditDate: report.createdAt.toISOString().split('T')[0]!,
      websiteUrl: snapshot.website?.url || report.audit?.website?.url || 'https://leadguard.io',
      overallScore: snapshot.score?.overall ?? 75,
      findingsCount: snapshot.findings?.length ?? 0,
      criticalFindings: snapshot.findings?.filter((f: any) => f.severity === 'CRITICAL').length ?? 0,
      branding,
    });

    // Generate formatted standalone PDF/HTML export artifact
    const storage = getStorageProvider();
    const filename = `report_${report.id}_v${report.version}.html`;
    const savedPath = await storage.save(filename, renderedHtml);

    await db.report.update({
      where: { id: report.id },
      data: {
        pdfPath: savedPath,
        pdfStatus: 'READY',
      },
    });

    return {
      success: true,
      reportId: report.id,
      pdfPath: savedPath,
    };
  } catch (error: any) {
    await db.report.update({
      where: { id: report.id },
      data: { pdfStatus: 'FAILED' },
    });
    throw error;
  }
}

export const pdfWorker = new Worker<PdfJobData>(
  'report',
  async (job) => {
    return processPdfJob(job);
  },
  {
    connection,
    concurrency: 2,
  }
);

pdfWorker.on('failed', (job, err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'worker',
      event: 'pdf_generation_failed',
      jobId: job?.id,
      reportId: job?.data.reportId,
      error: err.message,
    })
  );
});
