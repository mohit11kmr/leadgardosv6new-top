import { randomBytes, createHash } from 'node:crypto';
import { db } from '@leadguard/database';
import { entitlementService } from '../entitlementService.js';

export class WidgetService {
  async createWidget(
    organizationId: string,
    input: {
      name: string;
      clientWorkspaceId?: string;
      allowedOrigins: string[];
      theme?: 'LIGHT' | 'DARK' | 'AUTO';
      displayMode?: 'EMBED' | 'MODAL' | 'FLOATING_BUTTON';
    }
  ) {
    const entitlement = await entitlementService.canManageWidgets(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    const rawToken = `lgw_${randomBytes(24).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const widget = await db.widget.create({
      data: {
        organizationId,
        clientWorkspaceId: input.clientWorkspaceId || null,
        name: input.name,
        tokenHash,
        allowedOrigins: input.allowedOrigins || [],
        theme: input.theme || 'LIGHT',
        displayMode: input.displayMode || 'EMBED',
        enabled: true,
      },
    });

    const { tokenHash: _th, ...safeWidget } = widget;

    return {
      ...safeWidget,
      rawToken, // Provided strictly on creation for the embed snippet
    };
  }

  async listWidgets(organizationId: string) {
    const widgets = await db.widget.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        clientWorkspace: { select: { id: true, name: true } },
      },
    });
    return widgets.map(({ tokenHash: _th, ...w }) => w);
  }

  async getWidget(organizationId: string, widgetId: string) {
    const widget = await db.widget.findFirst({
      where: { id: widgetId, organizationId },
      include: {
        clientWorkspace: true,
      },
    });
    if (!widget) return null;
    const { tokenHash: _th, ...safe } = widget;
    return safe;
  }

  async updateWidget(
    organizationId: string,
    widgetId: string,
    input: {
      name?: string;
      allowedOrigins?: string[];
      theme?: 'LIGHT' | 'DARK' | 'AUTO';
      displayMode?: 'EMBED' | 'MODAL' | 'FLOATING_BUTTON';
      enabled?: boolean;
    }
  ) {
    const widget = await db.widget.findFirst({
      where: { id: widgetId, organizationId },
    });
    if (!widget) throw new Error('Widget not found');

    return db.widget.update({
      where: { id: widgetId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.allowedOrigins ? { allowedOrigins: input.allowedOrigins } : {}),
        ...(input.theme ? { theme: input.theme } : {}),
        ...(input.displayMode ? { displayMode: input.displayMode } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async deleteWidget(organizationId: string, widgetId: string) {
    const widget = await db.widget.findFirst({
      where: { id: widgetId, organizationId },
    });
    if (!widget) throw new Error('Widget not found');

    return db.widget.delete({
      where: { id: widgetId },
    });
  }

  async getPublicWidgetData(widgetId: string, origin?: string) {
    const widget = await db.widget.findUnique({
      where: { id: widgetId },
      include: {
        organization: { select: { name: true } },
        clientWorkspace: { select: { name: true, branding: true } },
      },
    });

    if (!widget || !widget.enabled) {
      throw new Error('Widget is disabled or not found');
    }

    // Origin header verification (Exact origin or wildcard only if explicitly in allowedOrigins)
    if (origin && widget.allowedOrigins.length > 0) {
      const allowed = widget.allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin === '*') return true;
        try {
          const reqOriginUrl = new URL(origin).origin;
          const allowedOriginUrl = new URL(allowedOrigin).origin;
          return reqOriginUrl === allowedOriginUrl;
        } catch {
          return allowedOrigin === origin;
        }
      });

      if (!allowed) {
        const err = new Error('Origin is not authorized to embed this widget');
        (err as unknown as { code: string }).code = 'ORIGIN_FORBIDDEN';
        throw err;
      }
    }

    // Return strictly whitelisted public payload (Never expose internal org data, secrets, or notes)
    return {
      id: widget.id,
      name: widget.name,
      theme: widget.theme,
      displayMode: widget.displayMode,
      agencyName: widget.clientWorkspace?.name || widget.organization.name,
      branding: widget.clientWorkspace?.branding || null,
      enabled: widget.enabled,
    };
  }
}

export const widgetService = new WidgetService();
