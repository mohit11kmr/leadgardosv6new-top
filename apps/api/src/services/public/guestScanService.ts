import { db } from '@leadguard/database';
import {
  validateExternalUrl,
  normalizeUrl,
  getClientIp,
  sanitizeFindingEvidence,
} from '@leadguard/shared';
import { auditQueue } from '../../queue.js';
import { redisClient } from '../../middleware/rateLimiters.js';
import { systemGuestOrganizationService } from '../systemGuestOrganizationService.js';
import { funnelEventService, FUNNEL_EVENTS } from '../funnelEventService.js';
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

export interface GuestScanErrorResponse {
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
  private systemGuestOrgId: string | null = null;

  private async getSystemGuestOrgId(): Promise<string> {
    if (!this.systemGuestOrgId) {
      this.systemGuestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();
    }
    return this.systemGuestOrgId;
  }

  async createGuestScan(
    url: string,
    idempotencyKey?: string,
    clientIp?: string,
    email?: string
  ): Promise<GuestScanResult> {
    if (!url) {
      throw this.createError('INVALID_REQUEST', 'URL is required');
    }

    const ip = clientIp || 'unknown';
    const domain = this.extractDomain(url);

    await this.checkGuestRateLimits(ip, domain);

    let normalized: string;
    try {
      const validatedUrl = await validateExternalUrl(url);
      normalized = normalizeUrl(validatedUrl.toString());
    } catch (err: any) {
      throw this.createError('SSRF_BLOCKED', `URL validation failed: ${err.message}`);
    }

    const orgId = await this.getSystemGuestOrgId();

    if (idempotencyKey) {
      const existing = await this.getGuestAuditByIdempotencyKey(orgId, idempotencyKey);
      if (existing) {
        return this.formatGuestScanResult(existing);
      }
    }

    let website = await db.website.findFirst({
      where: { normalizedUrl: normalized, organizationId: orgId },
    });

    if (!website) {
      website = await db.website.create({
        data: {
          organizationId: orgId,
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
        organizationId: orgId,
        websiteId: website.id,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
    });

    if (existingActiveGuestAudit) {
      // Backfill the email if this resubmission provided one the original
      // request didn't (e.g. visitor re-clicked "scan" after typing their
      // email the second time).
      if (email && !existingActiveGuestAudit.guestEmail) {
        await db.audit.update({ where: { id: existingActiveGuestAudit.id }, data: { guestEmail: email } });
      }
      return this.formatGuestScanResult(existingActiveGuestAudit);
    }

    const audit = await db.audit.create({
      data: {
        organizationId: orgId,
        websiteId: website.id,
        status: 'QUEUED',
        idempotencyKey: idempotencyKey || null,
        scoringVersion: 'v3',
        guestEmail: email || null,
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

    await this.recordGuestRateLimit(ip, domain);

    await funnelEventService.record({
      organizationId: orgId,
      type: FUNNEL_EVENTS.FREE_SCAN_STARTED,
      websiteId: website.id,
      auditId: audit.id,
      data: { url: normalized },
    });

    return this.formatGuestScanResult(audit);
  }

  async getGuestScanResult(scanId: string): Promise<PublicAuditDTO | null> {
    const orgId = await this.getSystemGuestOrgId();
    const audit = await db.audit.findFirst({
      where: { id: scanId, organizationId: orgId },
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

    // The `findings` relation above is capped (take: 5) so the free scan
    // only ever shows a teaser — but the true count must come from a
    // separate, uncapped query. Previously this used the capped array's own
    // length, so totalFindings could never exceed 5 even when the real
    // audit found many more, silently breaking the "N more issues — sign up
    // to unlock" conversion hook.
    const totalFindings = await db.auditFinding.count({ where: { auditId: audit.id } });

    if (audit.status === 'COMPLETED') {
      await funnelEventService.record({
        organizationId: orgId,
        type: FUNNEL_EVENTS.FREE_SCAN_COMPLETED,
        websiteId: audit.website?.id,
        auditId: audit.id,
        data: { findingsCount: totalFindings },
      });
    }

    return this.formatPublicAuditDto(audit, totalFindings);
  }

  async getGuestScanStatus(scanId: string): Promise<{ status: string; progress: number; progressStage: string } | null> {
    const orgId = await this.getSystemGuestOrgId();
    const audit = await db.audit.findFirst({
      where: { id: scanId, organizationId: orgId },
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

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private async getGuestAuditByIdempotencyKey(orgId: string, idempotencyKey: string) {
    return db.audit.findFirst({
      where: { organizationId: orgId, idempotencyKey },
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

  private sanitizeEvidence(evidence: unknown) {
    return sanitizeFindingEvidence(evidence);
  }

  private formatPublicAuditDto(audit: any, totalFindings?: number): PublicAuditDTO {
    const shownCount = audit.findings ? audit.findings.length : 0;
    const total = totalFindings ?? shownCount;
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
            businessImpact: f.businessImpact || null,
            affectedUrl: f.affectedUrl || null,
            evidence: this.sanitizeEvidence(f.evidence),
            normalizedIssueKey: f.normalizedIssueKey,
          }))
        : undefined,
      totalFindings: total,
      lockedFindingsCount: Math.max(0, total - shownCount),
      // No fabricated aggregate revenue/opportunity figure is emitted here.
      // Any visitor-facing estimate must be computed client-side from the
      // user's own inputs with explicit assumptions (§ no-fake-data policy).
      estimatedOpportunityLoss: null,
      createdAt: audit.createdAt instanceof Date ? audit.createdAt.toISOString() : audit.createdAt,
    };
  }

  private createError(code: string, message: string): GuestScanError {
    return new GuestScanError(code, message);
  }
}

export const guestScanService = new GuestScanService();