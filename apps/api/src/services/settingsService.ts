import { db } from '@leadguard/database';

export class SettingsService {
  /**
   * Retrieves user profile
   */
  async getProfile(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        locale: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      const err = new Error('User not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    return user;
  }

  /**
   * Updates user profile details
   */
  async updateProfile(
    userId: string,
    data: {
      name?: string;
      timezone?: string;
      locale?: string;
    }
  ) {
    return db.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        timezone: data.timezone,
        locale: data.locale,
      },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        locale: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Gets notification preferences for user in organization
   */
  async getNotificationPreferences(userId: string, organizationId: string) {
    let prefs = await db.notificationPreference.findFirst({
      where: { userId, organizationId, channel: 'EMAIL' },
    });

    if (!prefs) {
      prefs = await db.notificationPreference.create({
        data: {
          userId,
          organizationId,
          channel: 'EMAIL',
          eventTypes: ['AUDIT_COMPLETED', 'MONITORING_ALERT', 'BILLING_INVOICE'],
          enabled: true,
        },
      });
    }

    return prefs;
  }

  /**
   * Updates notification preferences
   */
  async updateNotificationPreferences(
    userId: string,
    organizationId: string,
    data: {
      eventTypes?: string[];
      enabled?: boolean;
    }
  ) {
    return db.notificationPreference.upsert({
      where: {
        userId_organizationId_channel: {
          userId,
          organizationId,
          channel: 'EMAIL',
        },
      },
      create: {
        userId,
        organizationId,
        channel: 'EMAIL',
        eventTypes: data.eventTypes || ['AUDIT_COMPLETED', 'MONITORING_ALERT', 'BILLING_INVOICE'],
        enabled: data.enabled !== undefined ? data.enabled : true,
      },
      update: {
        eventTypes: data.eventTypes,
        enabled: data.enabled,
      },
    });
  }

  /**
   * Lists active sessions for user
   */
  async getActiveSessions(userId: string, currentSessionId?: string) {
    const sessions = await db.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Revokes a specific session
   */
  async revokeSession(userId: string, sessionId: string) {
    const res = await db.session.deleteMany({
      where: { id: sessionId, userId },
    });
    return res.count > 0;
  }

  /**
   * Revokes all sessions except the current one
   */
  async revokeAllOtherSessions(userId: string, currentSessionId: string) {
    const res = await db.session.deleteMany({
      where: {
        userId,
        id: { not: currentSessionId },
      },
    });
    return res.count;
  }
}

export const settingsService = new SettingsService();
