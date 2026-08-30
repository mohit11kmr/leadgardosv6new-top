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
  SETTINGS_MANAGE: ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'],
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
