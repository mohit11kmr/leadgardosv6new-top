import { db } from '@leadguard/database';
import { verifyPassword } from '../auth.js';
import { adminService } from './adminService.js';
import { ROLE_CAPABILITIES, type PlatformCapability, type PlatformRole } from '../middleware/rbac.js';

/**
 * Small, functional internal-role administration surface (Control Plane
 * phase). Deliberately NOT a permissions-matrix UI/API — one list endpoint,
 * one write endpoint, both capability-gated by PLATFORM_ROLE_MANAGE, both
 * re-authenticated and audit-logged, matching the safety pattern already
 * established for refund issuance (RefundService).
 */

export class PlatformRoleValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PlatformRoleValidationError';
  }
}

const VALID_ROLES = new Set(Object.keys(ROLE_CAPABILITIES));

export class PlatformRoleService {
  /** Every platformAdmin user — the only users a role/capability can apply to. */
  async listPlatformUsers() {
    const users = await db.user.findMany({
      where: { platformAdmin: true },
      select: { id: true, email: true, name: true, isDisabled: true, platformRole: true, platformCapabilities: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return users;
  }

  async setPlatformRoleAndCapabilities(input: {
    actorUserId: string;
    targetUserId: string;
    role?: PlatformRole | null;
    capabilities?: PlatformCapability[];
    currentPassword: string;
    ipAddress?: string | null;
  }) {
    if (input.actorUserId === input.targetUserId) {
      throw new PlatformRoleValidationError('SELF_MODIFICATION_FORBIDDEN', 'You cannot change your own platform role or capabilities');
    }

    const actor = await db.user.findUnique({ where: { id: input.actorUserId } });
    if (!actor || !(await verifyPassword(actor.passwordHash, input.currentPassword))) {
      throw new PlatformRoleValidationError('REAUTH_FAILED', 'Current password is incorrect');
    }

    if (input.role != null && !VALID_ROLES.has(input.role)) {
      throw new PlatformRoleValidationError('INVALID_ROLE', `Unknown platform role: ${input.role}`);
    }
    // Only an existing OWNER may grant the OWNER role to someone else —
    // otherwise a FINANCE/OPERATIONS user with PLATFORM_ROLE_MANAGE granted
    // out-of-band could hand themselves (via a second admin account) the
    // top role. This is the one hardcoded escalation rule in this service.
    if (input.role === 'OWNER' && actor.platformRole !== 'OWNER') {
      throw new PlatformRoleValidationError('OWNER_GRANT_FORBIDDEN', 'Only an existing OWNER can grant the OWNER role');
    }

    const target = await db.user.findUnique({ where: { id: input.targetUserId } });
    if (!target) {
      throw new PlatformRoleValidationError('USER_NOT_FOUND', 'Target user not found');
    }
    if (!target.platformAdmin) {
      throw new PlatformRoleValidationError(
        'NOT_A_PLATFORM_ADMIN',
        'Target user is not a platform administrator — promote via the existing promote-admin script first, then assign a role/capability'
      );
    }

    const before = { role: target.platformRole, capabilities: target.platformCapabilities };

    const updated = await db.user.update({
      where: { id: input.targetUserId },
      data: {
        ...(input.role !== undefined ? { platformRole: input.role } : {}),
        ...(input.capabilities !== undefined ? { platformCapabilities: input.capabilities } : {}),
      },
      select: { id: true, email: true, platformRole: true, platformCapabilities: true },
    });

    console.log(
      JSON.stringify({
        level: 'info',
        service: 'api',
        event: 'platform_role_changed',
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        before,
        after: { role: updated.platformRole, capabilities: updated.platformCapabilities },
      })
    );
    await adminService.recordAdminAction(
      input.actorUserId,
      'PLATFORM_ROLE_CHANGED',
      'PLATFORM_USER',
      input.targetUserId,
      { before, after: { role: updated.platformRole, capabilities: updated.platformCapabilities } },
      input.ipAddress
    );

    return updated;
  }
}

export const platformRoleService = new PlatformRoleService();
