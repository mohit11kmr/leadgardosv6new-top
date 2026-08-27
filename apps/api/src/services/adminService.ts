import { db } from '@leadguard/database';

export class AdminService {
  /**
   * Records an admin action in the audit log
   */
  async recordAdminAction(
    userId: string | null,
    action: string,
    resourceType: string,
    resourceId?: string | null,
    details?: Record<string, any> | null,
    ipAddress?: string | null
  ) {
    return db.adminAuditLog.create({
      data: {
        userId,
        action,
        resourceType,
        resourceId,
        details: details as any,
        ipAddress,
      },
    });
  }

  /**
   * Retrieves live platform operational metrics
   */
  async getAdminMetrics() {
    const [
      totalUsers,
      totalOrganizations,
      totalWebsites,
      totalAudits,
      totalMonitoringRuns,
      totalActiveSubscriptions,
      paymentAggregate,
      failedAudits,
      securityEventsCount,
    ] = await Promise.all([
      db.user.count(),
      db.organization.count({ where: { deletedAt: null } }),
      db.website.count({ where: { deletedAt: null } }),
      db.audit.count(),
      db.monitoringRun.count(),
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.payment.aggregate({
        _sum: { amountInPaise: true },
        where: { status: 'CAPTURED' },
      }),
      db.audit.count({ where: { status: 'FAILED' } }),
      db.securityEvent.count(),
    ]);

    return {
      totalUsers,
      totalOrganizations,
      totalWebsites,
      totalAudits,
      totalMonitoringRuns,
      totalActiveSubscriptions,
      totalRevenuePaise: paymentAggregate._sum.amountInPaise || 0,
      totalRevenueRupees: (paymentAggregate._sum.amountInPaise || 0) / 100,
      failedAudits,
      securityEventsCount,
      systemHealth: failedAudits === 0 ? 'OPTIMAL' : 'DEGRADED',
    };
  }

  /**
   * Lists users with cursor pagination
   */
  async listUsers(options: { cursor?: string; limit?: number; search?: string } = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    const where: any = {};
    if (options.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { name: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const users = await db.user.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        isDisabled: true,
        disabledReason: true,
        emailVerifiedAt: true,
        createdAt: true,
        _count: {
          select: {
            memberships: true,
            sessions: true,
          },
        },
      },
    });

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        isDisabled: u.isDisabled,
        disabledReason: u.disabledReason,
        emailVerified: Boolean(u.emailVerifiedAt),
        organizationsCount: u._count.memberships,
        activeSessionsCount: u._count.sessions,
        createdAt: u.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Disables or restores a user account
   */
  async setUserDisabled(
    adminUserId: string,
    targetUserId: string,
    disabled: boolean,
    reason?: string,
    ipAddress?: string
  ) {
    const user = await db.user.update({
      where: { id: targetUserId },
      data: {
        isDisabled: disabled,
        disabledReason: disabled ? reason || 'Administrative action' : null,
      },
    });

    // If disabling user, revoke all active sessions immediately
    if (disabled) {
      await db.session.deleteMany({
        where: { userId: targetUserId },
      });
    }

    await this.recordAdminAction(
      adminUserId,
      disabled ? 'USER_DISABLED' : 'USER_RESTORED',
      'USER',
      targetUserId,
      { reason },
      ipAddress
    );

    return user;
  }

  /**
   * Revokes all active sessions for a user
   */
  async revokeUserSessions(adminUserId: string, targetUserId: string, ipAddress?: string) {
    const result = await db.session.deleteMany({
      where: { userId: targetUserId },
    });

    await this.recordAdminAction(
      adminUserId,
      'USER_SESSIONS_REVOKED',
      'USER',
      targetUserId,
      { revokedSessionsCount: result.count },
      ipAddress
    );

    return result.count;
  }

  /**
   * Lists organizations with cursor pagination
   */
  async listOrganizations(options: { cursor?: string; limit?: number; search?: string } = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    const where: any = { deletedAt: null };
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { slug: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const orgs = await db.organization.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
        _count: {
          select: {
            members: true,
            websites: true,
            audits: true,
          },
        },
      },
    });

    const hasMore = orgs.length > limit;
    const items = hasMore ? orgs.slice(0, limit) : orgs;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        isSuspended: o.isSuspended,
        suspendedReason: o.suspendedReason,
        activePlan: o.subscriptions[0]?.planId || 'FREE',
        membersCount: o._count.members,
        websitesCount: o._count.websites,
        auditsCount: o._count.audits,
        createdAt: o.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Suspends or restores an organization
   */
  async setOrganizationSuspended(
    adminUserId: string,
    organizationId: string,
    suspended: boolean,
    reason?: string,
    ipAddress?: string
  ) {
    const org = await db.organization.update({
      where: { id: organizationId },
      data: {
        isSuspended: suspended,
        suspendedReason: suspended ? reason || 'Administrative suspension' : null,
      },
    });

    await this.recordAdminAction(
      adminUserId,
      suspended ? 'ORG_SUSPENDED' : 'ORG_RESTORED',
      'ORGANIZATION',
      organizationId,
      { reason },
      ipAddress
    );

    return org;
  }

  /**
   * Lists administrative audit logs
   */
  async listAdminAuditLogs(options: { cursor?: string; limit?: number; resourceType?: string } = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    const where: any = {};
    if (options.resourceType) {
      where.resourceType = options.resourceType;
    }

    const logs = await db.adminAuditLog.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    const hasMore = logs.length > limit;
    const items = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    return {
      items: items.map((l) => ({
        id: l.id,
        action: l.action,
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        details: l.details,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
        user: l.user,
      })),
      nextCursor,
      hasMore,
    };
  }
}

export const adminService = new AdminService();
