import { db } from '@leadguard/database';
import { config } from '@leadguard/config';

const DEFAULT_SYSTEM_GUEST_ORG_ID = '00000000-0000-0000-0000-000000000001';

export class SystemGuestOrganizationService {
  private cachedOrganizationId: string | null = null;

  async getOrCreateSystemGuestOrganization(): Promise<string> {
    if (this.cachedOrganizationId) {
      return this.cachedOrganizationId;
    }

    let organizationId = config.SYSTEM_GUEST_ORGANIZATION_ID || DEFAULT_SYSTEM_GUEST_ORG_ID;

    const existing = await db.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!existing) {
      const result = await db.organization.upsert({
        where: { id: organizationId },
        create: {
          id: organizationId,
          name: config.SYSTEM_GUEST_ORGANIZATION_NAME,
          slug: 'system-guest-scans',
          isSuspended: false,
          deletedAt: null,
        },
        update: {
          name: config.SYSTEM_GUEST_ORGANIZATION_NAME,
          slug: 'system-guest-scans',
          isSuspended: false,
          deletedAt: null,
        },
        select: { id: true },
      });
      organizationId = result.id;
    }

    this.cachedOrganizationId = organizationId;
    return organizationId;
  }

  async getSystemGuestOrganizationId(): Promise<string> {
    if (this.cachedOrganizationId) {
      return this.cachedOrganizationId;
    }
    return this.getOrCreateSystemGuestOrganization();
  }

  clearCache(): void {
    this.cachedOrganizationId = null;
  }
}

export const systemGuestOrganizationService = new SystemGuestOrganizationService();