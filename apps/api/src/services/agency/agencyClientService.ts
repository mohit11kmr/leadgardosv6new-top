import { db } from '@leadguard/database';
import { entitlementService } from '../entitlementService.js';

export class AgencyClientService {
  async createClient(
    organizationId: string,
    input: {
      name: string;
      slug?: string;
      contactName?: string;
      contactEmail?: string;
      notes?: string;
      branding?: {
        logoUrl?: string;
        companyName?: string;
        website?: string;
        supportEmail?: string;
        primaryColor?: string;
        secondaryColor?: string;
        footer?: string;
      };
    }
  ) {
    const entitlement = await entitlementService.canManageClients(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    const baseSlug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    return db.clientWorkspace.create({
      data: {
        organizationId,
        name: input.name,
        slug: uniqueSlug,
        contactName: input.contactName || null,
        contactEmail: input.contactEmail || null,
        notes: input.notes || null,
        branding: input.branding ? (input.branding as object) : undefined,
        status: 'ACTIVE',
      },
    });
  }

  async listClients(
    organizationId: string,
    options: {
      status?: string;
      search?: string;
      cursor?: string;
      limit?: number;
    } = {}
  ) {
    const limit = Math.max(1, Math.min(100, options.limit || 20));

    const where = {
      organizationId,
      archivedAt: null,
      ...(options.status ? { status: options.status } : {}),
      ...(options.search
        ? {
            OR: [
              { name: { contains: options.search, mode: 'insensitive' as const } },
              { contactName: { contains: options.search, mode: 'insensitive' as const } },
              { contactEmail: { contains: options.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const clients = await db.clientWorkspace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: {
        websites: { where: { deletedAt: null } },
        members: { include: { user: { select: { id: true, email: true } } } },
        _count: {
          select: {
            websites: true,
            prospectCampaigns: true,
            widgets: true,
          },
        },
      },
    });

    const hasNextPage = clients.length > limit;
    const items = hasNextPage ? clients.slice(0, limit) : clients;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return { items, hasNextPage, nextCursor };
  }

  async getClient(organizationId: string, clientId: string) {
    return db.clientWorkspace.findFirst({
      where: { id: clientId, organizationId, archivedAt: null },
      include: {
        websites: {
          where: { deletedAt: null },
          include: {
            audits: { orderBy: { createdAt: 'desc' }, take: 3 },
            monitoringConfig: true,
          },
        },
        members: { include: { user: { select: { id: true, email: true } } } },
        widgets: true,
        prospectCampaigns: { orderBy: { createdAt: 'desc' }, take: 5 },
        competitorComparisons: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
  }

  async updateClient(
    organizationId: string,
    clientId: string,
    input: {
      name?: string;
      status?: 'ACTIVE' | 'ARCHIVED' | 'ONBOARDING';
      contactName?: string;
      contactEmail?: string;
      notes?: string;
      branding?: Record<string, unknown>;
    }
  ) {
    const client = await db.clientWorkspace.findFirst({
      where: { id: clientId, organizationId },
    });
    if (!client) throw new Error('Client workspace not found');

    return db.clientWorkspace.update({
      where: { id: clientId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.branding ? { branding: input.branding as object } : {}),
      },
    });
  }

  async archiveClient(organizationId: string, clientId: string) {
    const client = await db.clientWorkspace.findFirst({
      where: { id: clientId, organizationId },
    });
    if (!client) throw new Error('Client workspace not found');

    return db.clientWorkspace.update({
      where: { id: clientId },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });
  }

  async assignWebsite(organizationId: string, clientId: string, websiteId: string) {
    const client = await db.clientWorkspace.findFirst({
      where: { id: clientId, organizationId, archivedAt: null },
    });
    if (!client) throw new Error('Client workspace not found');

    const website = await db.website.findFirst({
      where: { id: websiteId, organizationId, deletedAt: null },
    });
    if (!website) throw new Error('Website not found');

    return db.website.update({
      where: { id: websiteId },
      data: { clientWorkspaceId: clientId },
    });
  }

  async removeWebsite(organizationId: string, clientId: string, websiteId: string) {
    const website = await db.website.findFirst({
      where: { id: websiteId, organizationId, clientWorkspaceId: clientId },
    });
    if (!website) throw new Error('Website not found in client workspace');

    return db.website.update({
      where: { id: websiteId },
      data: { clientWorkspaceId: null },
    });
  }

  async assignMember(organizationId: string, clientId: string, userId: string, role = 'MEMBER') {
    const client = await db.clientWorkspace.findFirst({
      where: { id: clientId, organizationId, archivedAt: null },
    });
    if (!client) throw new Error('Client workspace not found');

    return db.clientWorkspaceMember.upsert({
      where: {
        clientWorkspaceId_userId: {
          clientWorkspaceId: clientId,
          userId,
        },
      },
      create: {
        clientWorkspaceId: clientId,
        userId,
        role,
      },
      update: {
        role,
      },
    });
  }
}

export const agencyClientService = new AgencyClientService();
