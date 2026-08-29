import { db } from '@leadguard/database';
import {
  validateExternalUrl,
  normalizeUrl,
} from '@leadguard/shared';
import { auditQueue } from '../../queue.js';
import { redisClient } from '../../middleware/rateLimiters.js';
import type { PublicAuditDTO, PublicWebsiteDTO } from '../../dtos/public.js';

export class GuestScanError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GuestScanError';
    this.code = code;
  }
}

export interface GuestScanResult {
  scanId: string;
  status: string;
  website: PublicWebsiteDTO;
}

export interface GuestScanError {
  code: string;
  message: string;
}

export class GuestScanService {
  private readonly GUEST_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
  private readonly GUEST_RATE_LIMIT_MAX = 3;
  private readonly GUEST_PER_DOMAIN_LIMIT_MAX = 1;
  private readonly GUEST_AUDIT_RETENTION_DAYS = 7;
  private readonly GUEST_AUDIT_MAX_PAGES = 5;
  private readonly GUEST_AUDIT_MAX_DEPTH = 1;

  async createGuestScan(
    url: string,
    idempotencyKey?: string
  ): Promise<GuestScanResult> {
    if (!url) {
      throw this.createError('INVALID_REQUEST', 'URL is required');
    }

    const clientIp = this.getClientIdentifier();
    const domain = this.extractDomain(url);

    await this.checkGuestRateLimits(clientIp, domain);

    let normalized: string;
    try {
      const validatedUrl = await validateExternalUrl(url);
      normalized = normalizeUrl(validatedUrl.toString());
    } catch (err: any) {
      throw this.createError('SSRF_BLOCKED', `URL validation failed: ${err.message}`);
    }

    if (idempotencyKey) {
      const existing = await this.getGuestAuditByIdempotencyKey(idempotencyKey);
      if (existing) {
        return this.formatGuestScanResult(existing);
      }
    }

    let website = await db.website.findFirst({
      where: { normalizedUrl: normalized, organizationId: 'guest' },
    });

    if (!website) {
      website = await db.website.create({
        data: {
          organizationId: 'guest',
          url,
          domain,
          normalizedUrl: normalized,
          name: domain,
          status: 'ACTIVE',
        },
      });
    }

    const existingActiveGuestAudit = await db.audit.findFirst({
      where: {
        organizationId: 'guest',
        websiteId: website.id,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
    });

    if (existingActiveGuestAudit) {
      return this.formatGuestScanResult(existingActiveGuestAudit);
    }

    const audit = await db.audit.create({
      data: {
        organizationId: 'guest',
        websiteId: website.id,
        status: 'QUEUED',
        idempotencyKey: idempotencyKey || null,
        scoringVersion: 'v3',
      },
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
        score: true,
      },
    });

    await auditQueue.add('run-audit', {
      auditId: audit.id,
      options: {
        maxPages: this.GUEST_AUDIT_MAX_PAGES,
        maxDepth: this.GUEST_AUDIT_MAX_DEPTH,
        concurrencyLimit: 2,
        globalTimeoutMs: 30000,
        maxResponseBytes: 1000000,
      },
    }, { jobId: audit.id });

    await this.recordGuestRateLimit(clientIp, domain);

    return this.formatGuestScanResult(audit);
  }

  async getGuestScanResult(scanId: string): Promise<PublicAuditDTO | null> {
    const audit = await db.audit.findFirst({
      where: { id: scanId, organizationId: 'guest' },
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
        score: true,
        findings: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            severity: true,
            scoreImpact: true,
            recommendation: true,
            affectedUrl: true,
            evidence: true,
            normalizedIssueKey: true,
          },
          orderBy: [{ severity: 'asc' }, { scoreImpact: 'desc' }],
          take: 5,
        },
      },
    });

    if (!audit) {
      return null;
    }

    return this.formatPublicAuditDto(audit);
  }

  async getGuestScanStatus(scanId: string): Promise<{ status: string; progress: number; progressStage: string } | null> {
    const audit = await db.audit.findFirst({
      where: { id: scanId, organizationId: 'guest' },
      select: { status: true, progress: true, progressStage: true },
    });

    if (!audit) {
      return null;
    }

    return {
      status: audit.status,
      progress: audit.progress,
      progressStage: audit.progressStage,
    };
  }

  private async checkGuestRateLimits(clientIp: string, domain: string): Promise<void> {
    const ipKey = `ratelimit:guest_scan:ip:${clientIp}`;
    const domainKey = `ratelimit:guest_scan:domain:${domain}`;

    const now = Date.now();
    const clearBefore = now - this.GUEST_RATE_LIMIT_WINDOW_MS;

    const ipMulti = redisClient.multi();
    ipMulti.zremrangebyscore(ipKey, 0, clearBefore);
    ipMulti.zcard(ipKey);
    const ipResults = await ipMulti.exec();
    const ipCount = (ipResults?.[1]?.[1] as number) || 0;

    if (ipCount >= this.GUEST_RATE_LIMIT_MAX) {
      throw this.createError('RATE_LIMIT_EXCEEDED', `Guest scan rate limit exceeded. Maximum ${this.GUEST_RATE_LIMIT_MAX} scans per hour. Please try again later.`);
    }

    const domainMulti = redisClient.multi();
    domainMulti.zremrangebyscore(domainKey, 0, clearBefore);
    domainMulti.zcard(domainKey);
    const domainResults = await domainMulti.exec();
    const domainCount = (domainResults?.[1]?.[1] as number) || 0;

    if (domainCount >= this.GUEST_PER_DOMAIN_LIMIT_MAX) {
      throw this.createError('DOMAIN_RATE_LIMIT_EXCEEDED', `This domain has already been scanned recently. Please wait before scanning again.`);
    }
  }

  private async recordGuestRateLimit(clientIp: string, domain: string): Promise<void> {
    const ipKey = `ratelimit:guest_scan:ip:${clientIp}`;
    const domainKey = `ratelimit:guest_scan:domain:${domain}`;
    const now = Date.now();

    const multi = redisClient.multi();
    multi.zadd(ipKey, now, `${now}-${Math.random()}`);
    multi.pexpire(ipKey, this.GUEST_RATE_LIMIT_WINDOW_MS);
    multi.zadd(domainKey, now, `${now}-${Math.random()}`);
    multi.pexpire(domainKey, this.GUEST_RATE_LIMIT_WINDOW_MS);
    await multi.exec();
  }

  private getClientIdentifier(): string {
    return 'anonymous';
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private async getGuestAuditByIdempotencyKey(idempotencyKey: string) {
    return db.audit.findFirst({
      where: { organizationId: 'guest', idempotencyKey },
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
        score: true,
      },
    });
  }

  private formatGuestScanResult(audit: any): GuestScanResult {
    return {
      scanId: audit.id,
      status: audit.status,
      website: {
        id: audit.website.id,
        name: audit.website.name,
        url: audit.website.url,
        domain: audit.website.domain,
      },
    };
  }

  private formatPublicAuditDto(audit: any): PublicAuditDTO {
    return {
      id: audit.id,
      website: {
        id: audit.website.id,
        name: audit.website.name,
        url: audit.website.url,
        domain: audit.website.domain,
      },
      status: audit.status,
      score: audit.score
        ? {
            overall: audit.score.overall,
            lead: audit.score.lead,
            advertising: audit.score.advertising,
            seo: audit.score.seo,
            security: audit.score.security,
          }
        : null,
      findings: audit.findings
        ? audit.findings.map((f: any) => ({
            id: f.id,
            title: f.title,
            description: f.description,
            category: f.category,
            severity: f.severity,
            scoreImpact: f.scoreImpact,
            recommendation: f.recommendation,
            affectedUrl: f.affectedUrl,
            evidence: f.evidence,
            normalizedIssueKey: f.normalizedIssueKey,
          }))
        : undefined,
      createdAt: audit.createdAt instanceof Date ? audit.createdAt.toISOString() : audit.createdAt,
    };
  }

  private createError(code: string, message: string): GuestScanError {
    return new GuestScanError(code, message);
  }
}

export const guestScanService = new GuestScanService();