import type { Response, NextFunction } from 'express';
import { db } from '@leadguard/database';
import type { AuthRequest } from '../routes.js';

export type RoleType = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | 'AGENCY_ADMIN' | 'AGENCY_MEMBER';

export type Capability =
  | 'AUDIT_VIEW'
  | 'AUDIT_RUN'
  | 'AUDIT_CANCEL'
  | 'AUDIT_DELETE'
  | 'WEBSITE_VIEW'
  | 'WEBSITE_MANAGE'
  | 'MEMBER_MANAGE'
  | 'ORG_MANAGE'
  | 'API_KEY_MANAGE'
  | 'BILLING_VIEW'
  | 'BILLING_MANAGE'
  | 'SUBSCRIPTION_MANAGE'
  | 'MONITORING_VIEW'
  | 'MONITORING_MANAGE'
  | 'MONITOR_RUN'
  | 'CLIENT_VIEW'
  | 'CLIENT_MANAGE'
  | 'CLIENT_ASSIGN'
  | 'PROSPECT_VIEW'
  | 'PROSPECT_MANAGE'
  | 'PITCH_GENERATE'
  | 'REPORT_VIEW'
  | 'REPORT_CREATE'
  | 'REPORT_MANAGE'
  | 'WIDGET_MANAGE'
  | 'COMPETITOR_MANAGE'
  | 'ADMIN_DASHBOARD_VIEW'
  | 'USER_MANAGE'
  | 'SECURITY_AUDIT_VIEW'
  | 'SECURITY_AUDIT_RUN'
  | 'SECURITY_AUDIT_MANAGE'
  | 'BILLING_ADMIN'
  | 'WEBHOOK_MANAGE'
  | 'TESTIMONIAL_MANAGE'
  | 'SETTINGS_MANAGE';

const PERMISSION_MATRIX: Record<Capability, RoleType[]> = {
  AUDIT_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  AUDIT_RUN: ['OWNER', 'ADMIN', 'MEMBER', 'AGENCY_ADMIN'],
  AUDIT_CANCEL: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  AUDIT_DELETE: ['OWNER'],
  WEBSITE_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  WEBSITE_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  MEMBER_MANAGE: ['OWNER', 'ADMIN'],
  ORG_MANAGE: ['OWNER'],
  API_KEY_MANAGE: ['OWNER', 'ADMIN'],
  BILLING_VIEW: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  BILLING_MANAGE: ['OWNER', 'ADMIN'],
  SUBSCRIPTION_MANAGE: ['OWNER'],
  MONITORING_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  MONITORING_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  MONITOR_RUN: ['OWNER', 'ADMIN', 'MEMBER', 'AGENCY_ADMIN'],
  CLIENT_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  CLIENT_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  CLIENT_ASSIGN: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  PROSPECT_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  PROSPECT_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  PITCH_GENERATE: ['OWNER', 'ADMIN', 'MEMBER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  REPORT_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  REPORT_CREATE: ['OWNER', 'ADMIN', 'MEMBER', 'AGENCY_ADMIN'],
  REPORT_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  WIDGET_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  COMPETITOR_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  ADMIN_DASHBOARD_VIEW: ['OWNER', 'ADMIN'],
  USER_MANAGE: ['OWNER', 'ADMIN'],
  SECURITY_AUDIT_VIEW: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
  SECURITY_AUDIT_RUN: ['OWNER', 'ADMIN', 'MEMBER', 'AGENCY_ADMIN'],
  SECURITY_AUDIT_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  BILLING_ADMIN: ['OWNER'],
  WEBHOOK_MANAGE: ['OWNER', 'ADMIN'],
  TESTIMONIAL_MANAGE: ['OWNER', 'ADMIN', 'AGENCY_ADMIN'],
  SETTINGS_MANAGE: ['OWNER', 'ADMIN'],
};

export function hasPermission(role: RoleType, capability: Capability): boolean {
  const allowedRoles = PERMISSION_MATRIX[capability];
  return allowedRoles ? allowedRoles.includes(role) : false;
}

export function requirePlatformAdmin() {
  return async (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }

    const user = await db.user.findUnique({
      where: { id: request.auth.sub },
      select: { id: true, platformAdmin: true, isDisabled: true },
    });

    if (!user || user.isDisabled || !user.platformAdmin) {
      return response.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Platform administrator access required',
        },
      });
    }

    next();
  };
}

/**
 * Fine-grained internal capabilities for platformAdmin users (Revenue
 * Foundation phase). Additive to, never a replacement for,
 * requirePlatformAdmin(): every existing admin route keeps using the plain
 * boolean gate unchanged. Only the new routes this phase introduces
 * (refunds, revenue, customer-360, operations/queues, security-event
 * viewing) require a specific capability on top of platformAdmin=true —
 * deliberately a short, fixed list rather than a full role system, per the
 * R&D document's explicit "do not implement 20 roles for appearance"
 * instruction. Existing platformAdmin users were backfilled with every
 * capability below in the migration that introduced this column, so no
 * existing admin loses access to anything they could already do.
 */
export type PlatformCapability =
  | 'FINANCE_VIEW'
  | 'REFUND_ISSUE'
  | 'OPERATIONS_VIEW'
  | 'OPERATIONS_MANAGE'
  | 'CUSTOMER_360_VIEW'
  | 'SECURITY_VIEW'
  | 'PLATFORM_VIEW'
  | 'CUSTOMER_VIEW'
  | 'CUSTOMER_MANAGE'
  | 'AUDIT_LOG_VIEW'
  | 'PLATFORM_ROLE_MANAGE';

/**
 * Named convenience bundle over PlatformCapability (Control Plane phase).
 * Mirrors the Prisma `PlatformRole` enum exactly — kept as a plain string
 * union (not imported from @prisma/client) so this file has no compile-time
 * dependency on the generated client shape. A role is UNIONED with a user's
 * explicit platformCapabilities at check time (see getEffectivePlatformCapabilities),
 * never a replacement for it — a platformAdmin user with capabilities but no
 * role keeps working exactly as before this phase.
 */
export type PlatformRole = 'OWNER' | 'FINANCE' | 'OPERATIONS' | 'SECURITY' | 'SUPPORT' | 'ANALYST';

const ALL_PLATFORM_CAPABILITIES: PlatformCapability[] = [
  'FINANCE_VIEW',
  'REFUND_ISSUE',
  'OPERATIONS_VIEW',
  'OPERATIONS_MANAGE',
  'CUSTOMER_360_VIEW',
  'SECURITY_VIEW',
  'PLATFORM_VIEW',
  'CUSTOMER_VIEW',
  'CUSTOMER_MANAGE',
  'AUDIT_LOG_VIEW',
  'PLATFORM_ROLE_MANAGE',
];

/**
 * Deliberately small — one entry per role this phase actually needed a
 * surface for (revenue, operations, security, customer-facing support,
 * read-only analytics), not a general-purpose role catalog. OWNER is the
 * only role with PLATFORM_ROLE_MANAGE, so only an OWNER (or a user with
 * that capability explicitly granted) can change anyone's role.
 */
export const ROLE_CAPABILITIES: Record<PlatformRole, PlatformCapability[]> = {
  OWNER: ALL_PLATFORM_CAPABILITIES,
  FINANCE: ['FINANCE_VIEW', 'REFUND_ISSUE', 'PLATFORM_VIEW'],
  OPERATIONS: ['OPERATIONS_VIEW', 'OPERATIONS_MANAGE', 'PLATFORM_VIEW'],
  SECURITY: ['SECURITY_VIEW', 'AUDIT_LOG_VIEW', 'PLATFORM_VIEW'],
  SUPPORT: ['CUSTOMER_VIEW', 'CUSTOMER_360_VIEW', 'PLATFORM_VIEW'],
  ANALYST: ['PLATFORM_VIEW', 'FINANCE_VIEW', 'CUSTOMER_360_VIEW'],
};

/**
 * A role never grants CUSTOMER_MANAGE or REFUND_ISSUE by itself except
 * through OWNER/FINANCE above — deliberate: SUPPORT can look but not
 * suspend, ANALYST can read dashboards but never mutate anything
 * (no _MANAGE/_ISSUE capability appears in its list).
 */
export function getEffectivePlatformCapabilities(user: { platformCapabilities: string[]; platformRole?: string | null }): Set<string> {
  const fromRole = user.platformRole && user.platformRole in ROLE_CAPABILITIES ? ROLE_CAPABILITIES[user.platformRole as PlatformRole] : [];
  return new Set([...user.platformCapabilities, ...fromRole]);
}

/**
 * Method-aware capability gate for the queue operations board: a GET
 * (viewing queue/job state) only requires OPERATIONS_VIEW; anything else
 * (retry/remove/promote/clean/pause — all mutations) requires the stronger
 * OPERATIONS_MANAGE. Kept centralized here rather than duplicated inline in
 * routes.ts so the capability requirement for a mutation can never
 * accidentally drift to the weaker VIEW-only check.
 */
export function requireOperationsCapability() {
  return async (request: AuthRequest, response: Response, next: NextFunction) => {
    const capability: PlatformCapability = request.method === 'GET' ? 'OPERATIONS_VIEW' : 'OPERATIONS_MANAGE';
    return requirePlatformCapability(capability)(request, response, next);
  };
}

export function requirePlatformCapability(capability: PlatformCapability) {
  return async (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }

    const user = await db.user.findUnique({
      where: { id: request.auth.sub },
      select: { id: true, platformAdmin: true, isDisabled: true, platformCapabilities: true, platformRole: true },
    });

    if (!user || user.isDisabled || !user.platformAdmin) {
      return response.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Platform administrator access required' },
      });
    }

    if (!getEffectivePlatformCapabilities(user).has(capability)) {
      return response.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Missing internal capability: ${capability}`,
        },
      });
    }

    next();
  };
}

export function requirePermission(capability: Capability) {
  return async (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.auth) {
      return response.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    }

    const member = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: request.auth.organizationId,
          userId: request.auth.sub,
        },
      },
    });

    if (!member || !hasPermission(member.role as RoleType, capability)) {
      return response.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient role capability. Requires permission: ${capability}`,
        },
      });
    }

    next();
  };
}
