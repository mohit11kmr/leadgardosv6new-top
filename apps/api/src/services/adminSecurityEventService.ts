import { db } from '@leadguard/database';

/**
 * Admin security-event control plane (Control Plane phase, Phase 7).
 * SecurityEvent already exists and is already populated (13+ real event
 * types across auth/billing — see docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md
 * §2 for the full audit) but had zero admin visibility before this phase.
 * This is a read-only, bounded, paginated view over it — no new storage.
 *
 * SecurityEvent has no organizationId column (only userId) — organization
 * filtering traverses user.memberships, same pattern already used by
 * adminCustomer360Service.ts.
 */

const SEVERITY_MAP: Record<string, 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH'> = {
  LOGIN_SUCCESS: 'INFO',
  LOGIN_FAILURE: 'LOW',
  REFRESH_REUSE_DETECTED: 'HIGH',
  REFRESH_REJECTED: 'MEDIUM',
  SUSPICIOUS_PAYMENT_SIGNATURE: 'HIGH',
  SUSPICIOUS_PAYMENT_OWNERSHIP: 'HIGH',
  RAZORPAY_PROVIDER_VERIFICATION_FAILED: 'MEDIUM',
  RAZORPAY_WEBHOOK_INVALID_SIGNATURE: 'HIGH',
  API_KEY_CREATED: 'INFO',
  API_KEY_REVOKED: 'INFO',
  PASSWORD_RESET_REQUEST: 'INFO',
  PASSWORD_RESET: 'INFO',
  EMAIL_VERIFIED: 'INFO',
  SSRF_BLOCKED: 'HIGH',
};

/** RATE_LIMIT_ABUSE_<PREFIX> events are dynamically named per limiter (see rateLimiters.ts) — matched by prefix, not an exact key. */
function classifySeverity(type: string): 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' {
  if (SEVERITY_MAP[type]) return SEVERITY_MAP[type];
  if (type.startsWith('RATE_LIMIT_ABUSE')) return 'HIGH';
  return 'MEDIUM'; // unclassified — default to a visible, non-silent severity rather than INFO
}

export interface ListSecurityEventsOptions {
  type?: string;
  organizationId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export class AdminSecurityEventService {
  async listSecurityEvents(options: ListSecurityEventsOptions = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    const where: Record<string, unknown> = {};
    if (options.type) where.type = options.type;
    if (options.userId) where.userId = options.userId;
    if (options.organizationId) where.user = { memberships: { some: { organizationId: options.organizationId } } };
    if (options.from || options.to) {
      where.createdAt = {
        ...(options.from ? { gte: options.from } : {}),
        ...(options.to ? { lte: options.to } : {}),
      };
    }

    const events = await db.securityEvent.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        type: true,
        ipAddress: true,
        metadata: true,
        createdAt: true,
        userId: true,
        user: { select: { email: true } },
      },
    });

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;

    return {
      items: items.map((e) => ({
        id: e.id,
        type: e.type,
        severity: classifySeverity(e.type),
        ipAddress: e.ipAddress,
        metadata: e.metadata,
        createdAt: e.createdAt,
        userId: e.userId,
        userEmail: e.user?.email ?? null,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
      hasMore,
    };
  }
}

export const adminSecurityEventService = new AdminSecurityEventService();
