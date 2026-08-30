import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { db } from '@leadguard/database';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { entitlementService } from '../entitlementService.js';

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

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

    // Default policy: Reject wildcard '*' unless explicitly configured in dev mode
    const sanitizedOrigins = (input.allowedOrigins || []).filter((o) => {
      if (o === '*' && process.env.ALLOW_WIDGET_WILDCARDS !== 'true') {
        return false;
      }
      return Boolean(o.trim());
    });

    const rawToken = `lgw_${randomBytes(24).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const widget = await db.widget.create({
      data: {
        organizationId,
        clientWorkspaceId: input.clientWorkspaceId || null,
        name: input.name,
        tokenHash,
        allowedOrigins: sanitizedOrigins,
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

  async regenerateToken(organizationId: string, widgetId: string) {
    const widget = await db.widget.findFirst({
      where: { id: widgetId, organizationId },
    });
    if (!widget) {
      const err = new Error('Widget not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    const rawToken = `lgw_${randomBytes(24).toString('hex')}`;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const updated = await db.widget.update({
      where: { id: widgetId },
      data: { tokenHash },
    });

    const { tokenHash: _th, ...safeWidget } = updated;

    return {
      ...safeWidget,
      rawToken, // Provided strictly upon rotation
    };
  }

  async listWidgets(organizationId: string) {
    const widgets = await db.widget.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
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

    let sanitizedOrigins: string[] | undefined;
    if (input.allowedOrigins) {
      sanitizedOrigins = input.allowedOrigins.filter((o) => {
        if (o === '*' && process.env.ALLOW_WIDGET_WILDCARDS !== 'true') {
          return false;
        }
        return Boolean(o.trim());
      });
    }

    const updated = await db.widget.update({
      where: { id: widgetId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(sanitizedOrigins !== undefined ? { allowedOrigins: sanitizedOrigins } : {}),
        ...(input.theme ? { theme: input.theme } : {}),
        ...(input.displayMode ? { displayMode: input.displayMode } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });

    const { tokenHash: _th, ...safe } = updated;
    return safe;
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

  async getPublicWidgetData(
    widgetId: string,
    token?: string,
    origin?: string,
    clientIp = '127.0.0.1'
  ) {
    // 1. Token presence check
    if (!token || !token.trim()) {
      const err = new Error('Widget authentication token required');
      (err as unknown as { code: string }).code = 'MISSING_WIDGET_TOKEN';
      throw err;
    }

    const widget = await db.widget.findUnique({
      where: { id: widgetId },
      include: {
        organization: { select: { name: true } },
        clientWorkspace: { select: { name: true, branding: true } },
      },
    });

    if (!widget || !widget.enabled) {
      const err = new Error('Widget is disabled or not found');
      (err as unknown as { code: string }).code = 'WIDGET_NOT_FOUND';
      throw err;
    }

    // 2. Constant-time SHA-256 Token Verification
    const providedHash = createHash('sha256').update(token.trim()).digest('hex');
    const bufA = Buffer.from(providedHash, 'hex');
    const bufB = Buffer.from(widget.tokenHash, 'hex');

    if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
      const err = new Error('Invalid widget authentication token');
      (err as unknown as { code: string }).code = 'INVALID_WIDGET_TOKEN';
      throw err;
    }

    // 3. Strict Origin & Referer Validation Policy
    if (widget.allowedOrigins.length > 0) {
      if (!origin) {
        const err = new Error('Origin or valid Referer header is required for browser embeds');
        (err as unknown as { code: string }).code = 'ORIGIN_REQUIRED';
        throw err;
      }

      let parsedOrigin: string;
      try {
        parsedOrigin = new URL(origin).origin.toLowerCase();
      } catch {
        parsedOrigin = origin.toLowerCase();
      }

      const isAllowed = widget.allowedOrigins.some((allowed) => {
        if (allowed === '*' && process.env.ALLOW_WIDGET_WILDCARDS === 'true') {
          return true;
        }
        try {
          return new URL(allowed).origin.toLowerCase() === parsedOrigin;
        } catch {
          return allowed.toLowerCase() === parsedOrigin;
        }
      });

      if (!isAllowed) {
        const err = new Error('Origin is not authorized to embed this widget');
        (err as unknown as { code: string }).code = 'ORIGIN_FORBIDDEN';
        throw err;
      }
    }

    // 4. Redis Rate Limiting (60 requests per minute per widget & IP)
    const rateLimitKey = `widget:rate:${widgetId}:${clientIp}`;
    const currentCount = await redis.incr(rateLimitKey);
    if (currentCount === 1) {
      await redis.expire(rateLimitKey, 60);
    }
    if (currentCount > 60) {
      const err = new Error('Widget rate limit exceeded. Please try again later.');
      (err as unknown as { code: string }).code = 'WIDGET_RATE_LIMIT_EXCEEDED';
      throw err;
    }

    // 5. Sanitized Public Payload (Zero leakage of secrets, internal keys, billing, or audit notes)
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
