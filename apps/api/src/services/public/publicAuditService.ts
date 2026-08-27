import { db } from '@leadguard/database';
import { validateExternalUrl, normalizeUrl } from '@leadguard/shared';
import { auditQueue } from '../../queue.js';
import type { PublicAuditDTO, PaginatedResult } from '../../dtos/public.js';

export class PublicAuditService {
  /**
   * Triggers a new diagnostic audit with SSRF validation and database-backed idempotency
   */
  async createAudit(
    organizationId: string,
    input: { url?: string; websiteId?: string },
    idempotencyKey?: string
  ): Promise<PublicAuditDTO> {
    const { url, websiteId } = input;

    if (!url && !websiteId) {
      const err = new Error('url or websiteId is required');
      (err as any).code = 'INVALID_REQUEST';
      throw err;
    }

    // 1. Idempotency Check: Return existing audit if same idempotency key was used for this org
    if (idempotencyKey) {
      const existingAudit = await db.audit.findFirst({
        where: { organizationId, idempotencyKey },
        include: {
          website: { select: { id: true, url: true, name: true, domain: true } },
          score: true,
        },
      });

      if (existingAudit) {
        return this.formatAuditDto(existingAudit);
      }
    }

    let targetWebsiteId = websiteId;

    if (!targetWebsiteId && url) {
      // 2. Validate URL against SSRF (private IPs, loopback, metadata, credentials)
      try {
        await validateExternalUrl(url);
      } catch (err: any) {
        const error = new Error(`URL validation failed: ${err.message}`);
        (error as any).code = 'SSRF_BLOCKED';
        throw error;
      }

      // Safe normalization
      const normalized = normalizeUrl(url);
      let website = await db.website.findFirst({
        where: { organizationId, normalizedUrl: normalized },
      });

      if (!website) {
        const domain = new URL(normalized).hostname;
        website = await db.website.create({
          data: {
            organizationId,
            url,
            domain,
            normalizedUrl: normalized,
            name: domain,
          },
        });
      }
      targetWebsiteId = website.id;
    }

    // Verify website exists and belongs to the organization
    const website = await db.website.findFirst({
      where: { id: targetWebsiteId, organizationId },
    });

    if (!website) {
      const err = new Error('Website not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const audit = await db.audit.create({
      data: {
        organizationId,
        websiteId: website.id,
        status: 'QUEUED',
        idempotencyKey: idempotencyKey || null,
      },
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
        score: true,
      },
    });

    await auditQueue.add('run-audit', { auditId: audit.id });

    return this.formatAuditDto(audit);
  }

  /**
   * Lists audits for an organization with deterministic cursor pagination
   */
  async listAudits(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<PublicAuditDTO>> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const cursor = options.cursor;

    const audits = await db.audit.findMany({
      where: { organizationId },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
        score: true,
      },
    });

    const hasMore = audits.length > limit;
    const items = hasMore ? audits.slice(0, limit) : audits;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map((a) => this.formatAuditDto(a)),
      nextCursor,
      hasNextPage: hasMore,
      hasMore,
      limit,
    };
  }

  /**
   * Retrieves single audit with tenant isolation and IDOR protection
   */
  async getAudit(organizationId: string, auditId: string): Promise<PublicAuditDTO> {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
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
          },
        },
      },
    });

    if (!audit) {
      const err = new Error('Audit not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    return this.formatAuditDto(audit);
  }

  private formatAuditDto(audit: any): PublicAuditDTO {
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
          }))
        : undefined,
      createdAt: audit.createdAt instanceof Date ? audit.createdAt.toISOString() : audit.createdAt,
    };
  }
}

export const publicAuditService = new PublicAuditService();
