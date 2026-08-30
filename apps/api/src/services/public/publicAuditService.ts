import { db } from '@leadguard/database';
import {
  validateExternalUrl,
  normalizeUrl,
  decodeCursor,
  encodeCursor,
  buildCursorWhereClause,
  sanitizeFindingEvidence,
} from '@leadguard/shared';
import { auditQueue } from '../../queue.js';
import type { PublicAuditDTO, PaginatedResult } from '../../dtos/public.js';

export class PublicAuditService {
  /**
   * Triggers a new diagnostic audit with SSRF validation, concurrency limits, and database-backed idempotency
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

    // 2. Concurrency limit protection: Prevent unlimited parallel audits per organization
    const activeAudits = await db.audit.count({
      where: { organizationId, status: { in: ['QUEUED', 'RUNNING'] } },
    });
    if (activeAudits >= 10) {
      const err = new Error('Organization concurrent audit limit reached. Please wait for current audits to complete.');
      (err as any).code = 'CONCURRENT_AUDIT_LIMIT_EXCEEDED';
      throw err;
    }

    let targetWebsiteId = websiteId;

    if (!targetWebsiteId && url) {
      // 3. Validate URL against SSRF (private IPs, loopback, metadata, credentials)
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
        try {
          website = await db.website.create({
            data: {
              organizationId,
              url,
              domain,
              normalizedUrl: normalized,
              name: domain,
            },
          });
        } catch {
          // Race-condition fallback: lookup if created concurrently
          website = await db.website.findFirst({
            where: { organizationId, normalizedUrl: normalized },
          });
          if (!website) {
            website = await db.website.findFirst({
              where: { organizationId, url },
            });
          }
        }
      }

      if (!website) {
        const err = new Error('Failed to resolve or register target website');
        (err as any).code = 'WEBSITE_RESOLUTION_FAILED';
        throw err;
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
   * Lists audits for an organization with deterministic (createdAt, id) tuple cursor pagination
   */
  async listAudits(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ): Promise<PaginatedResult<PublicAuditDTO>> {
    const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
    const decodedCursor = decodeCursor(options.cursor);
    const cursorFilter = buildCursorWhereClause(decodedCursor);

    const where: any = { organizationId };
    if (cursorFilter) {
      where.AND = [cursorFilter];
    }

    const audits = await db.audit.findMany({
      where,
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        website: { select: { id: true, url: true, name: true, domain: true } },
        score: true,
      },
    });

    const hasMore = audits.length > limit;
    const items = hasMore ? audits.slice(0, limit) : audits;
    const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null;

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
            businessImpact: true,
            affectedUrl: true,
            evidence: true,
            normalizedIssueKey: true,
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

  private sanitizeEvidence(evidence: unknown) {
    return sanitizeFindingEvidence(evidence);
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
            businessImpact: f.businessImpact || null,
            affectedUrl: f.affectedUrl || null,
            evidence: this.sanitizeEvidence(f.evidence),
            normalizedIssueKey: f.normalizedIssueKey,
          }))
        : undefined,
      totalFindings: audit.findings ? audit.findings.length : 0,
      estimatedOpportunityLoss: null,
      createdAt: audit.createdAt instanceof Date ? audit.createdAt.toISOString() : audit.createdAt,
    };
  }
}

export const publicAuditService = new PublicAuditService();
