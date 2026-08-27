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
  | 'SUBSCRIPTION_MANAGE';

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
};

export function hasPermission(role: RoleType, capability: Capability): boolean {
  const allowedRoles = PERMISSION_MATRIX[capability];
  return allowedRoles ? allowedRoles.includes(role) : false;
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
