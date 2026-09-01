import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { whiteLabelService } from './agency/whiteLabelService.js';
import { outboxService } from './outboxService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const reportQueue = new Queue('report', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, hash] = combinedHash.split(':');
    if (!salt || !hash) return false;
    const derived = scryptSync(password, salt, 32);
    const expected = Buffer.from(hash, 'hex');
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface ReportSnapshot {
  reportVersion: string;
  templateVersion: string;
  brandingVersion: string;
  generatedAt: string;
  website: {
    id: string;
    name: string;
    url: string;
  };
  audit: {
    id: string;
    createdAt: string;
    status: string;
  };
  score: {
    overall: number;
    lead: number;
    advertising: number;
    seo: number;
    security: number;
  };
  findings: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    severity: string;
    scoreImpact: number;
    recommendation: string;
  }>;
  businessImpact: {
    overallScore: number;
    estimatedRevenueRisk: string;
    conversionHealth: string;
  };
  branding: {
    companyName: string;
    logoUrl?: string | null;
    primaryColor: string;
    secondaryColor: string;
    website?: string | null;
    supportEmail?: string | null;
    footerText?: string | null;
  };
}

export interface SecurityReportSnapshot {
  reportVersion: string;
  templateVersion: string;
  brandingVersion: string;
  reportType: 'SECURITY';
  generatedAt: string;
  website: {
    id: string;
    name: string;
    url: string;
  };
  run: {
    id: string;
    mode: string;
    status: string;
    score: number;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    pagesDiscovered: number;
    pagesFetched: number;
    pagesFailed: number;
    retestedFindings: number;
    fixedFindings: number;
  };
  summary: {
    severityCounts: Record<string, number>;
    statusCounts: Record<string, number>;
    topFindings: Array<{
      title: string;
      severity: string;
      affectedUrl: string | null;
      scoreImpact: number;
    }>;
  };
  findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    scoreImpact: number;
    affectedUrl: string | null;
    recommendation: string;
    cwe: string | null;
    cvssScore: number | null;
  }>;
  branding: {
    companyName: string;
    logoUrl?: string | null;
    primaryColor: string;
    secondaryColor: string;
    website?: string | null;
    supportEmail?: string | null;
    footerText?: string | null;
  };
}

export class ReportService {
  /**
   * Generates an immutable snapshot of an audit and stores it in the database
   */
  async createReportSnapshot(
    organizationId: string,
    auditId: string,
    options: {
      title?: string;
      clientWorkspaceId?: string;
      templateVersion?: string;
    } = {}
  ) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: {
        website: true,
        score: true,
        findings: {
          orderBy: { scoreImpact: 'desc' },
        },
      },
    });

    if (!audit || !audit.website) {
      const err = new Error('Audit not found');
      (err as unknown as { code: string }).code = 'AUDIT_NOT_FOUND';
      throw err;
    }

    const branding = await whiteLabelService.resolveBranding(
      organizationId,
      options.clientWorkspaceId || audit.website.clientWorkspaceId
    );

    const overallScore = audit.score?.overall ?? 70;
    const score = {
      overall: overallScore,
      lead: audit.score?.lead ?? 70,
      advertising: audit.score?.advertising ?? 70,
      seo: audit.score?.seo ?? 70,
      security: audit.score?.security ?? 70,
    };

    const businessImpact = {
      overallScore,
      estimatedRevenueRisk:
        overallScore < 50 ? 'HIGH' : overallScore < 75 ? 'MODERATE' : 'LOW',
      conversionHealth:
        overallScore >= 85
          ? 'EXCELLENT'
          : overallScore >= 70
          ? 'GOOD'
          : overallScore >= 50
          ? 'NEEDS_ATTENTION'
          : 'CRITICAL_RISK',
    };

    const snapshotData: ReportSnapshot = {
      reportVersion: 'v1',
      templateVersion: options.templateVersion || 'v1',
      brandingVersion: 'v1',
      generatedAt: new Date().toISOString(),
      website: {
        id: audit.website.id,
        name: audit.website.name,
        url: audit.website.url,
      },
      audit: {
        id: audit.id,
        createdAt: audit.createdAt.toISOString(),
        status: audit.status,
      },
      score,
      findings: audit.findings.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        category: f.category,
        severity: f.severity,
        scoreImpact: f.scoreImpact,
        recommendation: f.recommendation,
      })),
      businessImpact,
      branding: {
        companyName: branding.companyName || 'LeadGuard',
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor || '#2563eb',
        secondaryColor: branding.secondaryColor || '#1e293b',
        website: branding.website,
        supportEmail: branding.supportEmail,
        footerText: branding.footer,
      },
    };

    const title = options.title || `${audit.website.name} Diagnostic Audit Report`;

    const report = await db.report.create({
      data: {
        organizationId,
        auditId: audit.id,
        title,
        reportVersion: 'v1',
        templateVersion: options.templateVersion || 'v1',
        brandingVersion: 'v1',
        status: 'READY',
        snapshotData: snapshotData as any,
      },
      include: {
        shareLinks: true,
      },
    });

    // Emit outbox domain event
    await outboxService.emitEvent(
      organizationId,
      'REPORT_READY',
      'REPORT',
      report.id,
      {
        reportId: report.id,
        auditId: audit.id,
        websiteUrl: audit.website.url,
        title: report.title,
      }
    );

    return report;
  }

  /**
   * Generates an immutable branded (white-label) security report snapshot from a
   * completed VaultGuard security-audit run (LG-006/LG-007). Uses vaultRunId so it
   * does not pollute the lead-audit Report lineage.
   */
  async createVaultReportSnapshot(
    organizationId: string,
    vaultRunId: string,
    options: {
      title?: string;
      clientWorkspaceId?: string;
      templateVersion?: string;
    } = {}
  ) {
    const run = await db.vaultAuditRun.findFirst({
      where: { id: vaultRunId, organizationId },
      include: {
        website: true,
        findings: {
          orderBy: { scoreImpact: 'desc' },
        },
      },
    });

    if (!run || !run.website) {
      const err = new Error('Security audit run not found');
      (err as unknown as { code: string }).code = 'RUN_NOT_FOUND';
      throw err;
    }

    if (run.status !== 'COMPLETED' && run.status !== 'PARTIAL') {
      const err = new Error('Security audit run has not completed yet');
      (err as unknown as { code: string }).code = 'RUN_NOT_COMPLETED';
      throw err;
    }

    const branding = await whiteLabelService.resolveBranding(
      organizationId,
      options.clientWorkspaceId || run.website.clientWorkspaceId
    );

    const severityCounts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    const statusCounts: Record<string, number> = {};
    for (const f of run.findings) {
      const sev = f.severity.toUpperCase();
      if (sev in severityCounts) severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
      statusCounts[f.status] = (statusCounts[f.status] ?? 0) + 1;
    }
    const topFindings = run.findings
      .slice(0, 10)
      .map((f) => ({ title: f.title, severity: f.severity, affectedUrl: f.affectedUrl, scoreImpact: f.scoreImpact }));

    const snapshotData: SecurityReportSnapshot = {
      reportVersion: 'v1',
      templateVersion: options.templateVersion || 'v1',
      brandingVersion: 'v1',
      reportType: 'SECURITY',
      generatedAt: new Date().toISOString(),
      website: {
        id: run.website.id,
        name: run.website.name,
        url: run.website.url,
      },
      run: {
        id: run.id,
        mode: run.mode,
        status: run.status,
        score: run.score,
        startedAt: run.startedAt ? run.startedAt.toISOString() : null,
        completedAt: run.completedAt ? run.completedAt.toISOString() : null,
        durationMs: run.durationMs,
        pagesDiscovered: run.pagesDiscovered,
        pagesFetched: run.pagesFetched,
        pagesFailed: run.pagesFailed,
        retestedFindings: run.retestedFindings,
        fixedFindings: run.fixedFindings,
      },
      summary: { severityCounts, statusCounts, topFindings },
      findings: run.findings.map((f) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        severity: f.severity,
        status: f.status,
        scoreImpact: f.scoreImpact,
        affectedUrl: f.affectedUrl,
        recommendation: f.recommendation,
        cwe: f.cwe,
        cvssScore: f.cvssScore,
      })),
      branding: {
        companyName: branding.companyName || 'LeadGuard',
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor || '#2563eb',
        secondaryColor: branding.secondaryColor || '#1e293b',
        website: branding.website,
        supportEmail: branding.supportEmail,
        footerText: branding.footer,
      },
    };

    const title = options.title || `${run.website.name} Security Audit Report`;

    const report = await db.report.create({
      data: {
        organizationId,
        vaultRunId: run.id,
        title,
        reportVersion: 'v1',
        templateVersion: options.templateVersion || 'v1',
        brandingVersion: 'v1',
        status: 'READY',
        snapshotData: snapshotData as any,
      },
      include: { shareLinks: true },
    });

    await outboxService.emitEvent(organizationId, 'VAULT_REPORT_READY', 'VAULT_REPORT', report.id, {
      reportId: report.id,
      vaultRunId: run.id,
      websiteUrl: run.website.url,
      title: report.title,
    });

    return report;
  }

  /**
   * Retrieves a report with its immutable snapshot
   */
  async getReport(organizationId: string, reportId: string) {
    const report = await db.report.findFirst({
      where: { id: reportId, organizationId },
      include: {
        shareLinks: {
          where: { revokedAt: null },
          select: {
            id: true,
            passwordHash: true,
            accessCount: true,
            lastAccessedAt: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!report) {
      const err = new Error('Report not found');
      (err as unknown as { code: string }).code = 'REPORT_NOT_FOUND';
      throw err;
    }

    return {
      ...report,
      shareLinks: report.shareLinks.map((s) => ({
        ...s,
        isPasswordProtected: Boolean(s.passwordHash),
        passwordHash: undefined,
      })),
    };
  }

  /**
   * Lists reports with cursor pagination
   */
  async listReports(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    const reports = await db.report.findMany({
      where: { organizationId },
      take: limit + 1,
      ...(options.cursor
        ? {
            skip: 1,
            cursor: { id: options.cursor },
          }
        : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        title: true,
        auditId: true,
        version: true,
        status: true,
        pdfStatus: true,
        pdfPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = reports.length > limit;
    const items = hasMore ? reports.slice(0, limit) : reports;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Creates a secure cryptographic share link for a report
   */
  async createShareLink(
    organizationId: string,
    reportId: string,
    options: {
      password?: string;
      expiresInDays?: number;
    } = {}
  ) {
    const report = await db.report.findFirst({
      where: { id: reportId, organizationId },
    });

    if (!report) {
      const err = new Error('Report not found');
      (err as unknown as { code: string }).code = 'REPORT_NOT_FOUND';
      throw err;
    }

    const rawToken = `lg_share_${randomBytes(24).toString('hex')}`;
    const tokenHash = hashShareToken(rawToken);

    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 86400000)
      : null;

    const passwordHash = options.password ? hashPassword(options.password) : null;

    const shareLink = await db.reportShareLink.create({
      data: {
        reportId: report.id,
        tokenHash,
        passwordHash,
        expiresAt,
      },
      select: {
        id: true,
        reportId: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return {
      shareLink: {
        ...shareLink,
        isPasswordProtected: Boolean(passwordHash),
      },
      rawToken, // Plaintext token returned ONLY upon creation
    };
  }

  /**
   * Resolves + validates a public share token (format, revoked, expired,
   * password), shared by accessPublicReport and any other public flow that
   * needs to know which organization/report a share link belongs to (e.g.
   * public testimonial submission).
   */
  private async resolveShareLink(token: string, password?: string) {
    if (!token || !token.startsWith('lg_share_')) {
      const err = new Error('Invalid share token format');
      (err as unknown as { code: string }).code = 'INVALID_SHARE_TOKEN';
      throw err;
    }

    const tokenHash = hashShareToken(token);

    const link = await db.reportShareLink.findUnique({
      where: { tokenHash },
      include: { report: true },
    });

    if (!link || link.revokedAt) {
      const err = new Error('Share link has been revoked or does not exist');
      (err as unknown as { code: string }).code = 'SHARE_LINK_NOT_FOUND';
      throw err;
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      const err = new Error('Share link has expired');
      (err as unknown as { code: string }).code = 'SHARE_LINK_EXPIRED';
      throw err;
    }

    if (link.passwordHash) {
      if (!password) {
        const err = new Error('Password required to view this report');
        (err as unknown as { code: string }).code = 'PASSWORD_REQUIRED';
        throw err;
      }

      // Check brute-force attempts on this share link (max 10 attempts per minute)
      const attemptKey = `ratelimit:sharelink:${link.id}`;
      const attempts = await connection.incr(attemptKey);
      if (attempts === 1) {
        await connection.expire(attemptKey, 60);
      }
      if (attempts > 10) {
        const err = new Error('Too many password attempts. Please try again later.');
        (err as unknown as { code: string }).code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      if (!verifyPassword(password, link.passwordHash)) {
        const err = new Error('Incorrect password');
        (err as unknown as { code: string }).code = 'INVALID_PASSWORD';
        throw err;
      }

      // On successful password, clear attempts
      await connection.del(attemptKey).catch(() => {});
    }

    return link;
  }

  /**
   * Public endpoint to access a sanitized report via share token
   */
  async accessPublicReport(token: string, password?: string) {
    const link = await this.resolveShareLink(token, password);

    // Increment access count & update lastAccessedAt asynchronously
    await db.reportShareLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    return {
      title: link.report.title,
      snapshot: link.report.snapshotData as unknown as ReportSnapshot,
      generatedAt: link.report.createdAt,
    };
  }

  /**
   * Resolves which organization + report a share token belongs to, without
   * bumping access-count analytics — used by public flows that act on the
   * link's context (e.g. submitting a testimonial about that report) rather
   * than viewing the report itself.
   */
  async getShareLinkContext(token: string, password?: string) {
    const link = await this.resolveShareLink(token, password);
    return { organizationId: link.report.organizationId, reportId: link.reportId };
  }

  /**
   * Revokes a share link
   */
  async revokeShareLink(
    organizationId: string,
    reportId: string,
    shareLinkId: string
  ) {
    const report = await db.report.findFirst({
      where: { id: reportId, organizationId },
    });

    if (!report) {
      const err = new Error('Report not found');
      (err as unknown as { code: string }).code = 'REPORT_NOT_FOUND';
      throw err;
    }

    const updated = await db.reportShareLink.updateMany({
      where: { id: shareLinkId, reportId: report.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return updated.count > 0;
  }

  /**
   * Enqueues PDF generation job
   */
  async enqueuePdfGeneration(organizationId: string, reportId: string) {
    const report = await db.report.findFirst({
      where: { id: reportId, organizationId },
    });

    if (!report) {
      const err = new Error('Report not found');
      (err as unknown as { code: string }).code = 'REPORT_NOT_FOUND';
      throw err;
    }

    await db.report.update({
      where: { id: report.id },
      data: { pdfStatus: 'QUEUED' },
    });

    const job = await reportQueue.add('generate-pdf', {
      reportId: report.id,
      organizationId,
    });

    return {
      jobId: job.id,
      status: 'QUEUED',
    };
  }
}

export const reportService = new ReportService();
