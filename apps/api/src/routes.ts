import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from '@leadguard/database';
import { config } from '@leadguard/config';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  createAccessToken,
  createRefreshToken,
  hashPassword,
  hashRefreshToken,
  parseCookies,
  recordSecurityEvent,
  setRefreshCookie,
  verifyPassword,
} from './auth.js';
import { validateExternalUrl } from './security.js';
import { getClientIp } from '@leadguard/shared';
import { auditQueue, vaultQueue } from './queue.js';
import { intelligenceService } from './services/intelligenceService.js';
import { apiKeyService } from './services/apiKeyService.js';
import { authSecurityService } from './services/authSecurityService.js';
import { billingService } from './services/billingService.js';
import { entitlementService } from './services/entitlementService.js';
import { monitoringService } from './services/monitoringService.js';
import { agencyClientService } from './services/agency/agencyClientService.js';
import { prospectService } from './services/agency/prospectService.js';
import { pitchService } from './services/agency/pitchService.js';
import { widgetService } from './services/agency/widgetService.js';
import { competitorService } from './services/agency/competitorService.js';
import { agencyOverviewService } from './services/agency/agencyOverviewService.js';
import { whiteLabelService } from './services/agency/whiteLabelService.js';
import { toOrganizationDto, toUserDto, toWebsiteDto } from './dtos/index.js';
import { requirePermission, requirePlatformAdmin } from './middleware/rbac.js';
import { reportService } from './services/reportService.js';
import { adminService } from './services/adminService.js';
import { settingsService } from './services/settingsService.js';
import { testimonialService } from './services/testimonialService.js';
import { webhookService } from './services/webhookService.js';
import { publicAuditRouter } from './controllers/public/publicAuditController.js';
import { publicReportRouter } from './controllers/public/publicReportController.js';
import { publicMonitoringRouter } from './controllers/public/publicMonitoringController.js';
import { publicTestimonialsRouter } from './controllers/public/publicTestimonialsController.js';
import { guestScanRouter } from './controllers/public/guestScanController.js';
import { guestExpressFixRouter } from './controllers/public/guestExpressFixController.js';
import { openApiRouter } from './openapi.js';
import {
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  auditCreationLimiter,
  webhookLimiter,
} from './middleware/rateLimiters.js';

const authSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  organizationName: z.string().min(2).max(100).optional(),
});
const websiteSchema = z.object({ name: z.string().min(1).max(100), url: z.string().url() });

type Claims = { sub: string; organizationId: string };
export type AuthRequest = Request & {
  auth?: Claims;
  params: Record<string, string>;
  cookies?: Record<string, string>;
  rawBody?: string;
};

export function requireAuth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return response.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: requestId(request) },
    });
  }
  try {
    request.auth = jwt.verify(token, config.JWT_SECRET) as Claims;
    next();
  } catch {
    response.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid access token', requestId: requestId(request) },
    });
  }
}

function requestId(request: Request) {
  return request.header('x-request-id') ?? randomUUID();
}

export const apiRouter = Router();

// --- Public Webhooks ---
apiRouter.post('/webhooks/razorpay', webhookLimiter, async (request: AuthRequest, response, next) => {
  try {
    const signature = request.header('x-razorpay-signature');
    if (!signature) {
      return response.status(400).json({
        success: false,
        error: { code: 'MISSING_SIGNATURE', message: 'Razorpay webhook signature header missing' },
      });
    }

    const rawBody = request.rawBody;
    if (!rawBody) {
      return response.status(500).json({
        success: false,
        error: { code: 'RAW_BODY_UNAVAILABLE', message: 'Webhook raw request body was not captured' },
      });
    }

    const result = await billingService.handleRazorpayWebhook(rawBody, signature, request.body);
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid webhook signature')) {
      return response.status(400).json({
        success: false,
        error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed' },
      });
    }
    next(error);
  }
});

// --- Public Plans Catalog ---
apiRouter.get('/billing/plans', async (_request, response, next) => {
  try {
    const plans = await billingService.listPlans();
    response.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
});

// --- Public Whitelisted Widget Endpoint (Token-Authenticated, Origin-Restricted) ---
apiRouter.get('/public/widgets/:widgetId', async (request: Request, response: Response, next: NextFunction) => {
  try {
    const authHeader = request.headers.authorization;
    const tokenHeader = request.headers['x-leadguard-widget-token'];
    const rawToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : typeof tokenHeader === 'string'
      ? tokenHeader.trim()
      : undefined;

    const originHeader = request.headers.origin;
    const refererHeader = request.headers.referer;
    let origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    if (!origin && typeof refererHeader === 'string') {
      try {
        origin = new URL(refererHeader).origin;
      } catch {
        origin = undefined;
      }
    }

    const clientIp = getClientIp(request);
    const widgetId = request.params.widgetId as string;
    const data = await widgetService.getPublicWidgetData(widgetId, rawToken, origin, clientIp);
    response.json({ success: true, data });
  } catch (error: any) {
    if (error.code === 'MISSING_WIDGET_TOKEN' || error.code === 'INVALID_WIDGET_TOKEN') {
      return response.status(401).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    if (error.code === 'ORIGIN_FORBIDDEN' || error.code === 'ORIGIN_REQUIRED') {
      return response.status(403).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    if (error.code === 'WIDGET_RATE_LIMIT_EXCEEDED') {
      return response.status(429).json({
        success: false,
        error: { code: 'WIDGET_RATE_LIMIT_EXCEEDED', message: error.message },
      });
    }
    response.status(404).json({
      success: false,
      error: { code: 'WIDGET_NOT_FOUND', message: error.message || 'Widget not found' },
    });
  }
});

// --- Public Report Share Link Access (No authentication required) ---
apiRouter.get('/reports/share/:token', async (request: Request, response, next) => {
  try {
    const password = request.query.password as string | undefined;
    const token = request.params.token as string;
    const result = await reportService.accessPublicReport(token, password);
    response.json({ success: true, data: result });
  } catch (error: any) {
    if (error.code === 'PASSWORD_REQUIRED' || error.code === 'INVALID_PASSWORD') {
      return response.status(401).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    if (error.code === 'SHARE_LINK_NOT_FOUND' || error.code === 'SHARE_LINK_EXPIRED' || error.code === 'INVALID_SHARE_TOKEN') {
      return response.status(404).json({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    next(error);
  }
});

// --- Public Developer API & OpenAPI (API Key Authenticated or Open Docs) ---
apiRouter.use('/public/audits', publicAuditRouter);
apiRouter.use('/public/reports', publicReportRouter);
apiRouter.use('/public/monitors', publicMonitoringRouter);
apiRouter.use('/public/monitoring', publicMonitoringRouter);
apiRouter.use('/public/testimonials', publicTestimonialsRouter);

// --- Public Guest Scan (No Authentication Required) ---
apiRouter.use('/public', guestScanRouter);

// --- Public Guest Express Fix Checkout (No Authentication Required) ---
apiRouter.use('/public/express-fix', guestExpressFixRouter);

apiRouter.use('/public', openApiRouter);

// --- Auth Routes ---
apiRouter.post('/auth/register', authLimiter, async (request, response, next) => {
  try {
    const input = authSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const user = await db.user.create({ data: { email: input.email, passwordHash } });
    const organization = await db.organization.create({
      data: {
        name: input.organizationName ?? 'My Workspace',
        slug: `${input.email.split('@')[0]}-${randomUUID().slice(0, 8)}`,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });

    const refreshToken = createRefreshToken();
    const clientIp = getClientIp(request);
    const userAgent = request.headers['user-agent'] || null;

    await db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        ipAddress: clientIp,
        userAgent,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    setRefreshCookie(response, refreshToken);
    await recordSecurityEvent('LOGIN_SUCCESS', user.id, clientIp, { method: 'REGISTER' });

    response.status(201).json({
      success: true,
      data: {
        user: toUserDto(user),
        organization: toOrganizationDto(organization),
        accessToken: createAccessToken(user.id, organization.id),
      },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/login', authLimiter, async (request, response, next) => {
  try {
    const input = authSchema.pick({ email: true, password: true }).parse(request.body);
    const user = await db.user.findUnique({
      where: { email: input.email },
      include: { memberships: { include: { organization: true } } },
    });

    const clientIp = getClientIp(request);

    if (!user || !(await verifyPassword(user.passwordHash, input.password)) || !user.memberships[0]) {
      await recordSecurityEvent('LOGIN_FAILURE', user?.id, clientIp, { email: input.email });
      return response.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect', requestId: requestId(request) },
      });
    }

    const organizationId = user.memberships[0].organizationId;
    const refreshToken = createRefreshToken();
    const userAgent = request.headers['user-agent'] || null;

    await db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        ipAddress: clientIp,
        userAgent,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });

    setRefreshCookie(response, refreshToken);
    await recordSecurityEvent('LOGIN_SUCCESS', user.id, clientIp, { method: 'PASSWORD' });

    response.json({
      success: true,
      data: {
        user: toUserDto(user),
        organization: toOrganizationDto(user.memberships[0].organization),
        accessToken: createAccessToken(user.id, organizationId),
      },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/refresh', async (request, response, next) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const token =
      cookies[REFRESH_COOKIE_NAME] ||
      (typeof request.body === 'object' && request.body?.refreshToken ? String(request.body.refreshToken) : null);

    if (!token) {
      clearRefreshCookie(response);
      return response.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Refresh token missing', requestId: requestId(request) },
      });
    }

    const tokenHash = hashRefreshToken(token);
    const clientIp = getClientIp(request);

    // Check for token reuse incident
    const reusedSession = await db.session.findFirst({
      where: { replacedByTokenHash: tokenHash },
    });

    if (reusedSession) {
      await db.session.updateMany({
        where: { userId: reusedSession.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      clearRefreshCookie(response);
      await recordSecurityEvent('REFRESH_REUSE_DETECTED', reusedSession.userId, clientIp);

      return response.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_REUSE_DETECTED',
          message: 'Refresh token reuse detected. All sessions terminated for security.',
          requestId: requestId(request),
        },
      });
    }

    const session = await db.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: { include: { memberships: true } } },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.memberships[0]) {
      clearRefreshCookie(response);
      return response.status(401).json({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired', requestId: requestId(request) },
      });
    }

    // Refresh Token Rotation
    const replacement = createRefreshToken();
    const replacementHash = hashRefreshToken(replacement);

    await db.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: replacementHash,
        replacedByTokenHash: tokenHash,
        lastSeenAt: new Date(),
        ipAddress: clientIp,
        userAgent: request.headers['user-agent'] || null,
      },
    });

    setRefreshCookie(response, replacement);

    response.json({
      success: true,
      data: {
        accessToken: createAccessToken(session.userId, session.user.memberships[0].organizationId),
      },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/logout', async (request, response, next) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const token =
      cookies[REFRESH_COOKIE_NAME] ||
      (typeof request.body === 'object' && request.body?.refreshToken ? String(request.body.refreshToken) : null);

    if (token) {
      const tokenHash = hashRefreshToken(token);
      await db.session.updateMany({
        where: { refreshTokenHash: tokenHash },
        data: { revokedAt: new Date() },
      });
    }

    clearRefreshCookie(response);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Password Reset Routes
apiRouter.post('/auth/password-reset/request', passwordResetLimiter, async (request, response, next) => {
  try {
    const input = z.object({ email: z.string().email() }).parse(request.body);
    const res = await authSecurityService.requestPasswordReset(input.email, getClientIp(request));
    response.json({ success: true, data: res });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/password-reset/confirm', passwordResetLimiter, async (request, response, next) => {
  try {
    const input = z
      .object({
        token: z.string().min(10),
        newPassword: z.string().min(12),
      })
      .parse(request.body);
    const res = await authSecurityService.confirmPasswordReset(input.token, input.newPassword, getClientIp(request));
    response.json({ success: true, data: res });
  } catch (error) {
    next(error);
  }
});

// Email Verification Routes
apiRouter.post('/auth/email-verification/request', emailVerificationLimiter, requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const res = await authSecurityService.requestEmailVerification(request.auth!.sub, getClientIp(request));
    response.json({ success: true, data: res });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/email-verification/confirm', emailVerificationLimiter, async (request, response, next) => {
  try {
    const input = z.object({ token: z.string().min(10) }).parse(request.body);
    const res = await authSecurityService.confirmEmailVerification(input.token, getClientIp(request));
    response.json({ success: true, data: res });
  } catch (error) {
    next(error);
  }
});

// Session Management (Authenticated)
apiRouter.get('/auth/sessions', requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const cookies = parseCookies(request.headers.cookie);
    const currentToken = cookies[REFRESH_COOKIE_NAME];
    const currentTokenHash = currentToken ? hashRefreshToken(currentToken) : null;

    const sessions = await db.session.findMany({
      where: { userId: request.auth!.sub, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });

    response.json({
      success: true,
      data: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        isCurrent: currentTokenHash ? s.refreshTokenHash === currentTokenHash : false,
      })),
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/auth/sessions/:id', requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const result = await db.session.updateMany({
      where: { id: request.params.id, userId: request.auth!.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found', requestId: requestId(request) },
      });
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/auth/logout-all', requireAuth, async (request: AuthRequest, response, next) => {
  try {
    await db.session.updateMany({
      where: { userId: request.auth!.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    clearRefreshCookie(response);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Enforce authentication for all remaining routes
apiRouter.use(requireAuth);

// --- Organization Routes ---
apiRouter.get('/organizations', async (request: AuthRequest, response, next) => {
  try {
    const organizations = await db.organization.findMany({
      where: { deletedAt: null, members: { some: { userId: request.auth!.sub } } },
      select: { id: true, name: true, slug: true },
    });
    response.json({
      success: true,
      data: { activeOrganizationId: request.auth!.organizationId, organizations: organizations.map(toOrganizationDto) },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/organizations', async (request: AuthRequest, response, next) => {
  try {
    const input = z
      .object({
        name: z.string().min(2).max(100),
        slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60),
      })
      .parse(request.body);
    const organization = await db.organization.create({
      data: { ...input, members: { create: { userId: request.auth!.sub, role: 'OWNER' } } },
      select: { id: true, name: true, slug: true },
    });
    response.status(201).json({ success: true, data: toOrganizationDto(organization) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/organizations/:id/switch', async (request: AuthRequest, response, next) => {
  try {
    const membership = await db.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: String(request.params.id),
          userId: request.auth!.sub,
        },
      },
    });
    if (!membership) {
      return response.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Organization membership required', requestId: requestId(request) },
      });
    }
    response.json({
      success: true,
      data: {
        accessToken: createAccessToken(request.auth!.sub, membership.organizationId),
        organizationId: membership.organizationId,
      },
    });
  } catch (error) {
    next(error);
  }
});

// --- Billing & Monetization Routes (RBAC: BILLING_VIEW / BILLING_MANAGE / SUBSCRIPTION_MANAGE) ---
apiRouter.get('/billing', requirePermission('BILLING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const overview = await billingService.getBillingOverview(request.auth!.organizationId);
    if (!overview) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Billing account not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data: overview });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/billing/entitlements', requirePermission('BILLING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const overview = await entitlementService.getEntitlementsOverview(request.auth!.organizationId);
    response.json({ success: true, data: overview });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/billing/checkout/express-fix', requirePermission('BILLING_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const input = z
      .object({
        websiteId: z.string().uuid(),
        auditId: z.string().uuid().optional(),
        idempotencyKey: z.string().max(100).optional(),
      })
      .parse(request.body);

    const order = await billingService.createExpressFixCheckout(
      request.auth!.organizationId,
      request.auth!.sub,
      input.websiteId,
      input.auditId,
      input.idempotencyKey
    );
    response.status(201).json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/billing/checkout/express-fix/verify', requirePermission('BILLING_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const input = z
      .object({
        orderId: z.string().min(5),
        paymentId: z.string().min(5),
        signature: z.string().min(10),
        websiteId: z.string().uuid(),
        auditId: z.string().uuid().optional(),
      })
      .parse(request.body);

    const result = await billingService.verifyExpressFixPayment(
      request.auth!.organizationId,
      request.auth!.sub,
      input
    );
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/billing/checkout/subscription', requirePermission('SUBSCRIPTION_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ planCode: z.string().min(2) }).parse(request.body);
    const result = await billingService.createSubscriptionCheckout(
      request.auth!.organizationId,
      request.auth!.sub,
      input.planCode
    );
    response.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/billing/subscription/cancel', requirePermission('SUBSCRIPTION_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await billingService.cancelSubscription(
      request.auth!.organizationId,
      request.auth!.sub
    );
    response.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/billing/payments', requirePermission('BILLING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const payments = await db.payment.findMany({
      where: { organizationId: request.auth!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    response.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/billing/invoices', requirePermission('BILLING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const invoices = await db.invoice.findMany({
      where: { organizationId: request.auth!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    response.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
});

// --- Watchdog Continuous Monitoring Routes (RBAC: MONITORING_VIEW / MONITORING_MANAGE / MONITOR_RUN) ---
apiRouter.post('/monitoring', requirePermission('MONITORING_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const input = z
      .object({
        websiteId: z.string().uuid(),
        frequency: z.enum(['FIVE_MINUTES', 'FIFTEEN_MINUTES', 'HOURLY', 'DAILY']).optional(),
        maxPages: z.number().int().min(1).max(50).optional(),
        maxDepth: z.number().int().min(0).max(5).optional(),
        healthChecks: z.record(z.unknown()).optional(),
        alertPolicy: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const monitor = await monitoringService.createMonitor(request.auth!.organizationId, input);
    response.status(201).json({ success: true, data: monitor });
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message, requestId: requestId(request) },
      });
    }
    next(error);
  }
});

apiRouter.get('/monitoring', requirePermission('MONITORING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const monitors = await monitoringService.listMonitors(request.auth!.organizationId);
    response.json({ success: true, data: monitors });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/monitoring/:id', requirePermission('MONITORING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const monitor = await monitoringService.getMonitor(request.auth!.organizationId, request.params.id);
    if (!monitor) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Monitor not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/monitoring/:id', requirePermission('MONITORING_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const input = z
      .object({
        enabled: z.boolean().optional(),
        frequency: z.enum(['FIVE_MINUTES', 'FIFTEEN_MINUTES', 'HOURLY', 'DAILY']).optional(),
        maxPages: z.number().int().min(1).max(50).optional(),
        maxDepth: z.number().int().min(0).max(5).optional(),
        healthChecks: z.record(z.unknown()).optional(),
        alertPolicy: z.record(z.unknown()).optional(),
      })
      .parse(request.body);

    const updated = await monitoringService.updateMonitor(request.auth!.organizationId, request.params.id, input);
    response.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message, requestId: requestId(request) },
      });
    }
    next(error);
  }
});

apiRouter.delete('/monitoring/:id', requirePermission('MONITORING_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await monitoringService.deleteMonitor(request.auth!.organizationId, request.params.id);
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/monitoring/:id/runs', requirePermission('MONITORING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const cursor = typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const runs = await monitoringService.getRuns(request.auth!.organizationId, request.params.id, { cursor, limit });
    response.json({ success: true, data: runs.items, meta: { hasNextPage: runs.hasNextPage, nextCursor: runs.nextCursor } });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/monitoring/:id/findings', requirePermission('MONITORING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const cursor = typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const findings = await monitoringService.getFindings(request.auth!.organizationId, request.params.id, { cursor, limit });
    response.json({ success: true, data: findings.items, meta: { hasNextPage: findings.hasNextPage, nextCursor: findings.nextCursor } });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/monitoring/:id/alerts', requirePermission('MONITORING_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const cursor = typeof request.query.cursor === 'string' ? request.query.cursor : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const alerts = await monitoringService.getAlerts(request.auth!.organizationId, request.params.id, { cursor, limit });
    response.json({ success: true, data: alerts.items, meta: { hasNextPage: alerts.hasNextPage, nextCursor: alerts.nextCursor } });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/monitoring/:id/alerts/:alertId/ack', requirePermission('MONITORING_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const acked = await monitoringService.acknowledgeAlert(
      request.auth!.organizationId,
      request.params.id,
      request.params.alertId
    );
    response.json({ success: true, data: acked });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/monitoring/:id/run', requirePermission('MONITOR_RUN'), async (request: AuthRequest, response, next) => {
  try {
    const res = await monitoringService.triggerManualRun(request.auth!.organizationId, request.params.id);
    if (!res.enqueued) {
      const statusCode = res.status === 'MONITOR_RUN_IN_PROGRESS' ? 409 : 429;
      return response.status(statusCode).json({
        success: false,
        error: { code: res.status, message: res.message, requestId: requestId(request) },
      });
    }
    response.status(202).json({ success: true, data: res });
  } catch (error) {
    if (error instanceof Error && (error as { code?: string }).code === 'RATE_LIMIT_EXCEEDED') {
      return response.status(429).json({
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: error.message, requestId: requestId(request) },
      });
    }
    next(error);
  }
});

// --- API Key Management (RBAC: API_KEY_MANAGE) ---
apiRouter.get('/api-keys', requirePermission('API_KEY_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const keys = await apiKeyService.listApiKeys(request.auth!.organizationId);
    response.json({ success: true, data: keys });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/api-keys', requirePermission('API_KEY_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const canUse = await entitlementService.canUseApiKeys(request.auth!.organizationId);
    if (!canUse.allowed) {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: canUse.reason, requestId: requestId(request) },
      });
    }

    const input = z.object({ name: z.string().min(2).max(60), scopes: z.array(z.string()).optional() }).parse(request.body);
    const res = await apiKeyService.createApiKey(
      request.auth!.organizationId,
      request.auth!.sub,
      input.name,
      input.scopes
    );
    response.status(201).json({ success: true, data: res });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/api-keys/:id', requirePermission('API_KEY_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const revoked = await apiKeyService.revokeApiKey(request.params.id, request.auth!.organizationId, request.auth!.sub);
    if (!revoked) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API key not found', requestId: requestId(request) },
      });
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

// --- Website Routes (RBAC: WEBSITE_VIEW / WEBSITE_MANAGE) ---
apiRouter.get('/websites', requirePermission('WEBSITE_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const websites = await db.website.findMany({
      where: { organizationId: request.auth!.organizationId, deletedAt: null },
      include: {
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { score: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    response.json({ success: true, data: websites.map(toWebsiteDto) });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/websites', requirePermission('WEBSITE_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const canAdd = await entitlementService.canAddWebsite(request.auth!.organizationId);
    if (!canAdd.allowed) {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: canAdd.reason, requestId: requestId(request) },
      });
    }

    const input = websiteSchema.parse(request.body);
    const url = await validateExternalUrl(input.url);
    const normalizedUrl = url.toString().replace(/\/$/, '');
    const organizationId = request.auth!.organizationId;

    const website = await db.$transaction(async (tx) => {
      // Serialize concurrent creates per-organization so plan-limit enforcement
      // is race-free (advisory lock held until this transaction commits).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
      const count = await tx.website.count({
        where: { organizationId, deletedAt: null },
      });
      const allowance = await entitlementService.getAllowedWebsites(organizationId);
      if (count >= allowance) {
        throw new Error('PLAN_LIMIT_REACHED');
      }
      return tx.website.create({
        data: {
          organizationId,
          name: input.name,
          url: input.url,
          normalizedUrl,
          domain: url.hostname,
        },
      });
    });

    await entitlementService.recordUsage(organizationId, 'WEBSITES');
    response.status(201).json({ success: true, data: toWebsiteDto(website) });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/websites/:id', requirePermission('WEBSITE_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const website = await db.website.findFirst({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId, deletedAt: null },
      include: {
        audits: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { score: true },
        },
      },
    });
    if (!website) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data: toWebsiteDto(website) });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/websites/:id', requirePermission('WEBSITE_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await db.website.updateMany({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId, deletedAt: null },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });
    if (!result.count) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) },
      });
    }
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/websites/:id', requirePermission('WEBSITE_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const input = z.object({ name: z.string().min(1).max(100), url: z.string().url() }).parse(request.body);
    const url = await validateExternalUrl(input.url);
    const result = await db.website.updateMany({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId, deletedAt: null },
      data: {
        name: input.name,
        url: input.url,
        normalizedUrl: url.toString().replace(/\/$/, ''),
        domain: url.hostname,
      },
    });
    if (!result.count) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) },
      });
    }
    const website = await db.website.findFirst({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId },
    });
    response.json({ success: true, data: website ? toWebsiteDto(website) : null });
  } catch (error) {
    next(error);
  }
});

// --- Audit Execution & Results Routes (RBAC: AUDIT_VIEW / AUDIT_RUN / AUDIT_CANCEL) ---
apiRouter.post('/audits', requirePermission('AUDIT_RUN'), auditCreationLimiter, async (request: AuthRequest, response, next) => {
  try {
    const canRun = await entitlementService.canRunAudit(request.auth!.organizationId);
    if (!canRun.allowed) {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: canRun.reason, requestId: requestId(request) },
      });
    }

    const input = z
      .object({
        websiteId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(100).optional(),
      })
      .parse(request.body);

    const website = await db.website.findFirst({
      where: { id: input.websiteId, organizationId: request.auth!.organizationId, deletedAt: null },
    });
    if (!website) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) },
      });
    }

    if (input.idempotencyKey) {
      const existing = await db.audit.findFirst({
        where: {
          organizationId: request.auth!.organizationId,
          websiteId: website.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return response.status(200).json({ success: true, data: existing, meta: { idempotent: true } });
    }

    let audit;
    try {
      audit = await db.audit.create({
        data: {
          organizationId: request.auth!.organizationId,
          websiteId: website.id,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' || !input.idempotencyKey) throw error;
      audit = await db.audit.findFirstOrThrow({
        where: {
          organizationId: request.auth!.organizationId,
          websiteId: website.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      return response.status(200).json({ success: true, data: audit, meta: { idempotent: true } });
    }

    await entitlementService.recordUsage(request.auth!.organizationId, 'AUDITS');
    try {
      await auditQueue.add('audit:create', { auditId: audit.id }, { jobId: audit.id });
    } catch (error) {
      await entitlementService.releaseUsage(request.auth!.organizationId, 'AUDITS');
      await db.audit
        .update({ where: { id: audit.id }, data: { status: 'CANCELLED' } })
        .catch(() => {});
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'api',
          event: 'audit_enqueue_failed',
          auditId: audit.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
      return response.status(503).json({
        success: false,
        error: {
          code: 'QUEUE_UNAVAILABLE',
          message: 'Audit processing queue is temporarily unavailable. Please retry.',
          requestId: requestId(request),
        },
      });
    }
    response.status(202).json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const audits = await db.audit.findMany({
      where: { organizationId: request.auth!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(request.query.limit) || 25, 100),
      include: { website: true, score: true },
    });
    response.json({ success: true, data: audits });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const audit = await db.audit.findFirst({
      where: { id: request.params.id, organizationId: request.auth!.organizationId },
      include: {
        website: true,
        score: true,
        findings: { orderBy: { severity: 'asc' }, take: 500 },
      },
    });
    if (!audit) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/progress', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const audit = await db.audit.findFirst({
      where: { id: request.params.id, organizationId: request.auth!.organizationId },
      select: { id: true, status: true, progress: true, progressStage: true },
    });
    if (!audit) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data: audit });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/findings', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const filters = z
      .object({
        category: z.enum(['LEAD', 'ADVERTISING', 'SEO', 'SECURITY']).optional(),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
        scope: z.enum(['PAGE', 'WEBSITE', 'AUDIT']).optional(),
        ruleId: z.string().regex(/^LG-\d{3}$/).optional(),
        search: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      })
      .parse(request.query);

    const audit = await db.audit.findFirst({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId },
      select: { id: true },
    });
    if (!audit) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }

    const findings = await db.auditFinding.findMany({
      where: {
        auditId: audit.id,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.scope ? { scope: filters.scope } : {}),
        ...(filters.ruleId ? { ruleId: filters.ruleId } : {}),
        ...(filters.search
          ? {
              OR: [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
                { recommendation: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: filters.limit + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    const hasNextPage = findings.length > filters.limit;
    const data = hasNextPage ? findings.slice(0, filters.limit) : findings;

    response.json({
      success: true,
      data,
      meta: {
        hasNextPage,
        hasPreviousPage: Boolean(filters.cursor),
        nextCursor: hasNextPage ? data[data.length - 1]?.id ?? null : null,
        previousCursor: filters.cursor ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/pages', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const audit = await db.audit.findFirst({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId },
      select: { id: true },
    });
    if (!audit) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }

    const pages = await db.auditPage.findMany({
      where: { auditId: audit.id },
      orderBy: { depth: 'asc' },
      take: 500,
    });

    response.json({ success: true, data: pages });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/runs', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const audit = await db.audit.findFirst({
      where: { id: String(request.params.id), organizationId: request.auth!.organizationId },
      select: { id: true },
    });
    if (!audit) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }

    const runs = await db.auditRun.findMany({
      where: { auditId: audit.id },
      orderBy: { createdAt: 'desc' },
    });

    response.json({ success: true, data: runs });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/audits/:id/cancel', requirePermission('AUDIT_CANCEL'), async (request: AuthRequest, response, next) => {
  try {
    const result = await db.audit.updateMany({
      where: {
        id: request.params.id,
        organizationId: request.auth!.organizationId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: { status: 'CANCELLED', progressStage: 'cancelled' },
    });
    if (!result.count) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Cancellable audit not found', requestId: requestId(request) },
      });
    }
    response.status(202).json({ success: true, data: { cancelled: true } });
  } catch (error) {
    next(error);
  }
});

// --- VaultGuard Security Audit Endpoints (LG-038, §5b) ---
const vaultWebsite = async (websiteId: string, organizationId: string) =>
  db.website.findFirst({
    where: { id: websiteId, organizationId, deletedAt: null },
  });

const vaultRunError = (response: Response, code: string, message: string, req: Request) =>
  response.status(code === 'NOT_FOUND' ? 404 : 403).json({
    success: false,
    error: { code, message, requestId: requestId(req) },
  });

apiRouter.post(
  '/websites/:websiteId/security-audit',
  requirePermission('SECURITY_AUDIT_RUN'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) {
        return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);
      }

      const input = z
        .object({
          mode: z.enum(['STANDARD', 'RETEST']).default('STANDARD'),
          idempotencyKey: z.string().min(8).max(100).optional(),
          maxPages: z.number().int().min(1).max(50).optional(),
          maxDepth: z.number().int().min(0).max(5).optional(),
        })
        .parse(request.body);

      const { plan, entitlements } = await entitlementService.getOrganizationPlan(request.auth!.organizationId);
      const planCode = plan?.code || 'FREE';

      if (!entitlements.apiAccess && planCode !== 'ENTERPRISE') {
        return vaultRunError(response, 'PLAN_LIMIT_REACHED', 'Security audits require an API-enabled plan.', request);
      }

      if (input.idempotencyKey) {
        const existing = await db.vaultAuditRun.findFirst({
          where: {
            organizationId: request.auth!.organizationId,
            websiteId: website.id,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing)
          return response.status(200).json({ success: true, data: existing, meta: { idempotent: true } });
      }

      const canRun = await entitlementService.canRunAudit(request.auth!.organizationId);
      if (!canRun.allowed) {
        return vaultRunError(response, 'PLAN_LIMIT_REACHED', canRun.reason ?? 'Audit quota exhausted.', request);
      }

      let run: { id: string } | null = null;
      try {
        run = await db.vaultAuditRun.create({
          data: {
            organizationId: request.auth!.organizationId,
            websiteId: website.id,
            mode: input.mode,
            triggerSource: 'api',
            triggeredBy: request.auth!.sub,
            ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002' || !input.idempotencyKey) throw error;
        const dup = await db.vaultAuditRun.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: request.auth!.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        return response.status(200).json({ success: true, data: dup, meta: { idempotent: true } });
      }

      await entitlementService.recordUsage(request.auth!.organizationId, 'AUDITS');
      try {
        await vaultQueue.add(
          'vault:scan',
          { runId: run.id, options: { maxPages: input.maxPages, maxDepth: input.maxDepth } },
          { jobId: run.id }
        );
      } catch (error) {
        await entitlementService.releaseUsage(request.auth!.organizationId, 'AUDITS');
        await db.vaultAuditRun
          .update({ where: { id: run.id }, data: { status: 'CANCELLED', errorCode: 'ENQUEUE_FAILED' } })
          .catch(() => {});
        console.error(
          JSON.stringify({
            level: 'error',
            service: 'api',
            event: 'vault_enqueue_failed',
            runId: run.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
        return response.status(503).json({
          success: false,
          error: {
            code: 'QUEUE_UNAVAILABLE',
            message: 'Security audit queue is temporarily unavailable. Please retry.',
            requestId: requestId(request),
          },
        });
      }
      response.status(202).json({ success: true, data: run });
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.get(
  '/websites/:websiteId/security-audit',
  requirePermission('SECURITY_AUDIT_VIEW'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);

      const runs = await db.vaultAuditRun.findMany({
        where: { websiteId: website.id },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(request.query.limit) || 25, 100),
      });
      response.json({ success: true, data: runs });
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.get(
  '/websites/:websiteId/security-audit/:runId',
  requirePermission('SECURITY_AUDIT_VIEW'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);

      const run = await db.vaultAuditRun.findFirst({
        where: { id: request.params.runId, websiteId: website.id },
        include: { findings: true },
      });
      if (!run) {
        return response.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Security audit run not found', requestId: requestId(request) },
        });
      }
      response.json({ success: true, data: run });
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.get(
  '/websites/:websiteId/security-audit/:runId/findings',
  requirePermission('SECURITY_AUDIT_VIEW'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);

      const run = await db.vaultAuditRun.findFirst({
        where: { id: request.params.runId, websiteId: website.id },
        select: { id: true },
      });
      if (!run) {
        return response.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Security audit run not found', requestId: requestId(request) },
        });
      }

      const statusValid = z.enum(['OPEN', 'TRIAGED', 'VERIFIED_IGNORED', 'FIXED']).safeParse(request.query.status);
      const where = statusValid.success
        ? { runId: run.id, status: statusValid.data as never }
        : { runId: run.id };

      const page = Math.max(Number(request.query.page) || 1, 1);
      const limit = Math.min(Number(request.query.limit) || 50, 100);
      const [findings, total] = await Promise.all([
        db.vaultAuditFinding.findMany({
          where,
          orderBy: { severity: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.vaultAuditFinding.count({ where }),
      ]);
      response.json({ success: true, data: findings, meta: { total, page, limit } });
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.post(
  '/websites/:websiteId/security-audit/:runId/retest',
  requirePermission('SECURITY_AUDIT_RUN'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);

      const previous = await db.vaultAuditRun.findFirst({
        where: { id: request.params.runId, websiteId: website.id },
      });
      if (!previous) {
        return response.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Security audit run not found', requestId: requestId(request) },
        });
      }

      const canRun = await entitlementService.canRunAudit(request.auth!.organizationId);
      if (!canRun.allowed) {
        return vaultRunError(response, 'PLAN_LIMIT_REACHED', canRun.reason ?? 'Audit quota exhausted.', request);
      }

      const run = await db.vaultAuditRun.create({
        data: {
          organizationId: request.auth!.organizationId,
          websiteId: website.id,
          mode: 'RETEST',
          triggerSource: 'retest',
          triggeredBy: request.auth!.sub,
          auditId: previous.auditId,
        },
      });

      await entitlementService.recordUsage(request.auth!.organizationId, 'AUDITS');
      try {
        await vaultQueue.add(
          'vault:scan',
          { runId: run.id, options: {} },
          { jobId: run.id }
        );
      } catch (error) {
        await entitlementService.releaseUsage(request.auth!.organizationId, 'AUDITS');
        await db.vaultAuditRun
          .update({ where: { id: run.id }, data: { status: 'CANCELLED', errorCode: 'ENQUEUE_FAILED' } })
          .catch(() => {});
        return response.status(503).json({
          success: false,
          error: { code: 'QUEUE_UNAVAILABLE', message: 'Security audit queue is temporarily unavailable.', requestId: requestId(request) },
        });
      }
      response.status(202).json({ success: true, data: run });
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.patch(
  '/websites/:websiteId/security-audit/:runId/findings/:findingId',
  requirePermission('SECURITY_AUDIT_MANAGE'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);

      const finding = await db.vaultAuditFinding.findFirst({
        where: { id: request.params.findingId, runId: request.params.runId, websiteId: website.id },
      });
      if (!finding) {
        return response.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Finding not found', requestId: requestId(request) },
        });
      }

      const input = z
        .object({
          status: z.enum(['TRIAGED', 'VERIFIED_IGNORED']).optional(),
          ignoreReason: z.string().max(500).optional(),
        })
        .parse(request.body);

      if (input.status === 'VERIFIED_IGNORED' && !input.ignoreReason) {
        return response.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'ignoreReason is required when ignoring a finding.', requestId: requestId(request) },
        });
      }

      const updated = await db.vaultAuditFinding.update({
        where: { id: finding.id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.ignoreReason ? { ignoreReason: input.ignoreReason } : {}),
          ...(input.status === 'VERIFIED_IGNORED'
            ? { ignoredById: request.auth!.sub, ignoredAt: new Date() }
            : {}),
        },
      });
      response.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
);

apiRouter.get(
  '/websites/:websiteId/security-audit/:runId/findings/:findingId/evidence',
  requirePermission('SECURITY_AUDIT_VIEW'),
  async (request: AuthRequest, response, next) => {
    try {
      const website = await vaultWebsite(request.params.websiteId, request.auth!.organizationId);
      if (!website) return vaultRunError(response, 'NOT_FOUND', 'Website not found', request);

      const finding = await db.vaultAuditFinding.findFirst({
        where: { id: request.params.findingId, runId: request.params.runId, websiteId: website.id },
        select: { id: true, evidence: true, affectedUrl: true },
      });
      if (!finding) {
        return response.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Finding not found', requestId: requestId(request) },
        });
      }
      response.json({ success: true, data: { evidence: finding.evidence, affectedUrl: finding.affectedUrl } });
    } catch (error) {
      next(error);
    }
  }
);

// --- Intelligence Endpoints (RBAC: AUDIT_VIEW) ---
apiRouter.get('/audits/:id/score/explanation', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const data = await intelligenceService.getScoreExplanation(request.params.id, request.auth!.organizationId);
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/score', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const data = await intelligenceService.getScoreExplanation(request.params.id, request.auth!.organizationId);
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data: data.score });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/business-impact', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const data = await intelligenceService.getBusinessImpact(request.params.id, request.auth!.organizationId);
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/summary', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const data = await intelligenceService.getExecutiveSummary(request.params.id, request.auth!.organizationId);
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/scenarios', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const querySchema = z.object({
      monthlyVisitors: z.coerce.number().min(0).optional(),
      conversionRate: z.coerce.number().min(0).max(100).optional(),
      averageLeadValue: z.coerce.number().min(0).optional(),
    });
    const inputs = querySchema.parse(request.query);
    const data = await intelligenceService.getRevenueScenarios(
      request.params.id,
      request.auth!.organizationId,
      inputs
    );
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/funnel', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const querySchema = z.object({
      monthlyVisitors: z.coerce.number().min(0).optional(),
      conversionRate: z.coerce.number().min(0).max(100).optional(),
    });
    const inputs = querySchema.parse(request.query);
    const data = await intelligenceService.getFunnelSimulation(
      request.params.id,
      request.auth!.organizationId,
      inputs
    );
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/audits/:id/whatsapp-optimizer', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const data = await intelligenceService.getWhatsAppOptimization(
      request.params.id,
      request.auth!.organizationId
    );
    if (!data) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) },
      });
    }
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PHASE 7: AGENCY PLATFORM ENDPOINTS
// ==========================================

// Agency Overview
apiRouter.get('/agency/overview', requirePermission('CLIENT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const data = await agencyOverviewService.getOverview(request.auth!.organizationId);
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Client Workspaces
apiRouter.post('/agency/clients', requirePermission('CLIENT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional().or(z.literal('')),
      notes: z.string().optional(),
      branding: z.record(z.unknown()).optional(),
    });
    const input = schema.parse(request.body);
    const client = await agencyClientService.createClient(request.auth!.organizationId, {
      ...input,
      contactEmail: input.contactEmail || undefined,
    });
    response.status(201).json({ success: true, data: client });
  } catch (error: any) {
    if (error.code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message },
      });
    }
    next(error);
  }
});

apiRouter.get('/agency/clients', requirePermission('CLIENT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().optional(),
    });
    const query = schema.parse(request.query);
    const data = await agencyClientService.listClients(request.auth!.organizationId, query);
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/agency/clients/:id', requirePermission('CLIENT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const client = await agencyClientService.getClient(request.auth!.organizationId, request.params.id);
    if (!client) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Client workspace not found' },
      });
    }
    response.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/agency/clients/:id', requirePermission('CLIENT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      status: z.enum(['ACTIVE', 'ARCHIVED', 'ONBOARDING']).optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional().or(z.literal('')),
      notes: z.string().optional(),
      branding: z.record(z.unknown()).optional(),
    });
    const input = schema.parse(request.body);
    const client = await agencyClientService.updateClient(
      request.auth!.organizationId,
      request.params.id,
      {
        ...input,
        contactEmail: input.contactEmail || undefined,
      }
    );
    response.json({ success: true, data: client });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/agency/clients/:id', requirePermission('CLIENT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await agencyClientService.archiveClient(request.auth!.organizationId, request.params.id);
    response.json({ success: true, message: 'Client workspace archived' });
  } catch (error) {
    next(error);
  }
});

// Client Website Assignment
apiRouter.post('/agency/clients/:id/websites', requirePermission('CLIENT_ASSIGN'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({ websiteId: z.string().uuid() });
    const { websiteId } = schema.parse(request.body);
    const updated = await agencyClientService.assignWebsite(
      request.auth!.organizationId,
      request.params.id,
      websiteId
    );
    response.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/agency/clients/:id/websites/:websiteId', requirePermission('CLIENT_ASSIGN'), async (request: AuthRequest, response, next) => {
  try {
    const updated = await agencyClientService.removeWebsite(
      request.auth!.organizationId,
      request.params.id,
      request.params.websiteId
    );
    response.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// 500-Site Prospect Hunter
apiRouter.post('/agency/prospect-campaigns', requirePermission('PROSPECT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      clientWorkspaceId: z.string().uuid().optional(),
      sourceType: z.enum(['MANUAL', 'CSV']).default('MANUAL'),
      items: z
        .array(
          z.object({
            url: z.string(),
            businessName: z.string().optional(),
            industry: z.string().optional(),
            location: z.string().optional(),
          })
        )
        .optional(),
      csvContent: z.string().optional(),
    });
    const input = schema.parse(request.body);
    const campaign = await prospectService.createCampaign(request.auth!.organizationId, input);
    response.status(201).json({ success: true, data: campaign });
  } catch (error: any) {
    if (error.code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message },
      });
    }
    next(error);
  }
});

apiRouter.get('/agency/prospect-campaigns', requirePermission('PROSPECT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().optional(),
    });
    const query = schema.parse(request.query);
    const campaigns = await prospectService.listCampaigns(request.auth!.organizationId, query);
    response.json({
      success: true,
      data: campaigns.items,
      meta: { hasNextPage: campaigns.hasNextPage, nextCursor: campaigns.nextCursor },
    });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/agency/prospect-campaigns/:id', requirePermission('PROSPECT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const campaign = await prospectService.getCampaign(request.auth!.organizationId, request.params.id);
    if (!campaign) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Prospect campaign not found' },
      });
    }
    response.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/agency/prospect-campaigns/:id/start', requirePermission('PROSPECT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await prospectService.startCampaign(request.auth!.organizationId, request.params.id);
    response.status(202).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/agency/prospect-campaigns/:id/pause', requirePermission('PROSPECT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await prospectService.pauseCampaign(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/agency/prospect-campaigns/:id/cancel', requirePermission('PROSPECT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await prospectService.cancelCampaign(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/agency/prospect-campaigns/:id/prospects', requirePermission('PROSPECT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      status: z.string().optional(),
      minScore: z.coerce.number().optional(),
      maxScore: z.coerce.number().optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().optional(),
    });
    const query = schema.parse(request.query);
    const data = await prospectService.getProspects(request.auth!.organizationId, request.params.id, query);
    response.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Async Grounded AI Cold Pitch Generator
apiRouter.post('/agency/prospects/:id/pitches', requirePermission('PITCH_GENERATE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      tone: z.enum(['PROFESSIONAL', 'DIRECT', 'CONSULTATIVE', 'URGENT']).optional(),
      language: z.string().optional(),
    });
    const options = schema.parse(request.body);
    const idempotencyKey = (request.headers['idempotency-key'] as string) || undefined;
    const result = await pitchService.enqueuePitchGeneration(
      request.auth!.organizationId,
      request.params.id,
      { ...options, idempotencyKey }
    );
    response.status(202).json({ success: true, data: result });
  } catch (error: any) {
    if (error.code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message },
      });
    }
    if (error.code === 'NOT_FOUND') {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

// Pitch Generation Status Polling
apiRouter.get('/agency/prospects/:id/pitches/generations/:generationId', requirePermission('PROSPECT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const status = await pitchService.getGenerationStatus(
      request.auth!.organizationId,
      request.params.generationId
    );
    response.json({ success: true, data: status });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

apiRouter.get('/agency/prospects/:id/pitches', requirePermission('PROSPECT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const pitches = await pitchService.listPitches(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: pitches });
  } catch (error) {
    next(error);
  }
});

// Diagnostic Studio Widgets
apiRouter.post('/agency/widgets', requirePermission('WIDGET_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      clientWorkspaceId: z.string().uuid().optional(),
      allowedOrigins: z.array(z.string()).default([]),
      theme: z.enum(['LIGHT', 'DARK', 'AUTO']).default('LIGHT'),
      displayMode: z.enum(['EMBED', 'MODAL', 'FLOATING_BUTTON']).default('EMBED'),
    });
    const input = schema.parse(request.body);
    const widget = await widgetService.createWidget(request.auth!.organizationId, input);
    response.status(201).json({ success: true, data: widget });
  } catch (error: any) {
    if (error.code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message },
      });
    }
    next(error);
  }
});

apiRouter.get('/agency/widgets', requirePermission('WIDGET_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const widgets = await widgetService.listWidgets(request.auth!.organizationId);
    response.json({ success: true, data: widgets });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/agency/widgets/:id', requirePermission('WIDGET_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const widget = await widgetService.getWidget(request.auth!.organizationId, request.params.id);
    if (!widget) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Widget not found' },
      });
    }
    response.json({ success: true, data: widget });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/agency/widgets/:id/regenerate-token', requirePermission('WIDGET_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const rotated = await widgetService.regenerateToken(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: rotated });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } });
    }
    next(error);
  }
});

apiRouter.patch('/agency/widgets/:id', requirePermission('WIDGET_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      allowedOrigins: z.array(z.string()).optional(),
      theme: z.enum(['LIGHT', 'DARK', 'AUTO']).optional(),
      displayMode: z.enum(['EMBED', 'MODAL', 'FLOATING_BUTTON']).optional(),
      enabled: z.boolean().optional(),
    });
    const input = schema.parse(request.body);
    const updated = await widgetService.updateWidget(request.auth!.organizationId, request.params.id, input);
    response.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/agency/widgets/:id', requirePermission('WIDGET_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await widgetService.deleteWidget(request.auth!.organizationId, request.params.id);
    response.json({ success: true, message: 'Widget deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Competitive Radar
apiRouter.post('/agency/competitors', requirePermission('COMPETITOR_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      targetUrl: z.string(),
      competitorUrls: z.array(z.string()).min(1).max(5),
      clientWorkspaceId: z.string().uuid().optional(),
    });
    const input = schema.parse(request.body);
    const comparison = await competitorService.createCompetitorComparison(request.auth!.organizationId, input);
    response.status(201).json({ success: true, data: comparison });
  } catch (error: any) {
    if (error.code === 'PLAN_LIMIT_REACHED') {
      return response.status(403).json({
        success: false,
        error: { code: 'PLAN_LIMIT_REACHED', message: error.message },
      });
    }
    next(error);
  }
});

apiRouter.get('/agency/competitors', requirePermission('COMPETITOR_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const comparisons = await competitorService.listCompetitorComparisons(request.auth!.organizationId);
    response.json({ success: true, data: comparisons });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/agency/competitors/:id', requirePermission('COMPETITOR_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const comparison = await competitorService.getCompetitorComparison(request.auth!.organizationId, request.params.id);
    if (!comparison) {
      return response.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Competitor comparison not found' },
      });
    }
    response.json({ success: true, data: comparison });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/agency/competitors/:id/run', requirePermission('COMPETITOR_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await competitorService.runCompetitorComparison(request.auth!.organizationId, request.params.id);
    response.status(202).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/agency/competitors/:id', requirePermission('COMPETITOR_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await competitorService.deleteCompetitorComparison(request.auth!.organizationId, request.params.id);
    response.json({ success: true, message: 'Competitor comparison deleted' });
  } catch (error) {
    next(error);
  }
});

// White-Label Report Preview & Export
apiRouter.get('/agency/reports/:id/preview', requirePermission('AUDIT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const report = await db.report.findFirst({
      where: { id: request.params.id, organizationId: request.auth!.organizationId },
      include: { audit: { include: { website: true, score: true, findings: true } } },
    });
    if (!report || !report.audit) {
      return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Report not found' } });
    }

    const branding = await whiteLabelService.resolveBranding(
      request.auth!.organizationId,
      report.audit.website.clientWorkspaceId
    );

    const html = whiteLabelService.generateBrandedHtml({
      title: `${report.audit.website.name} Diagnostic Audit Report`,
      auditDate: report.audit.createdAt.toISOString().split('T')[0]!,
      websiteUrl: report.audit.website.url,
      overallScore: report.audit.score?.overall ?? 70,
      findingsCount: report.audit.findings.length,
      criticalFindings: report.audit.findings.filter((f) => f.severity === 'CRITICAL').length,
      branding,
    });

    response.setHeader('Content-Type', 'text/html');
    response.send(html);
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PHASE 8: REPORTS & CRYPTOGRAPHIC SHARE LINKS
// ==========================================

// Create immutable report snapshot from audit
apiRouter.post('/reports', requirePermission('REPORT_CREATE'), async (request: AuthRequest, response, next) => {
  try {
    const { auditId, title, clientWorkspaceId, templateVersion } = request.body;
    if (!auditId) {
      return response.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'auditId is required' } });
    }
    const report = await reportService.createReportSnapshot(request.auth!.organizationId, auditId, {
      title,
      clientWorkspaceId,
      templateVersion,
    });
    response.status(201).json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// List immutable reports with pagination
apiRouter.get('/reports', requirePermission('REPORT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const cursor = request.query.cursor as string | undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const result = await reportService.listReports(request.auth!.organizationId, { cursor, limit });
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Get report details & immutable snapshot
apiRouter.get('/reports/:id', requirePermission('REPORT_VIEW'), async (request: AuthRequest, response, next) => {
  try {
    const report = await reportService.getReport(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// Create cryptographic share link
apiRouter.post('/reports/:id/share', requirePermission('REPORT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const { password, expiresInDays } = request.body;
    const result = await reportService.createShareLink(request.auth!.organizationId, request.params.id, {
      password,
      expiresInDays,
    });
    response.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Revoke share link
apiRouter.delete('/reports/:id/share/:shareId', requirePermission('REPORT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const revoked = await reportService.revokeShareLink(request.auth!.organizationId, request.params.id, request.params.shareId);
    response.json({ success: true, message: 'Share link revoked', revoked });
  } catch (error) {
    next(error);
  }
});

// Enqueue async PDF generation
apiRouter.post('/reports/:id/pdf', requirePermission('REPORT_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await reportService.enqueuePdfGeneration(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PHASE 8: WEBHOOKS MANAGEMENT
// ==========================================

apiRouter.get('/webhooks', requirePermission('WEBHOOK_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const endpoints = await webhookService.listEndpoints(request.auth!.organizationId);
    response.json({ success: true, data: endpoints });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/webhooks', requirePermission('WEBHOOK_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const { url, events, description } = request.body;
    if (!url) {
      return response.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message: 'url is required' } });
    }
    const result = await webhookService.createEndpoint(request.auth!.organizationId, {
      url,
      events: events || ['*'],
      description,
    });
    response.status(201).json({ success: true, data: result });
  } catch (error: any) {
    if (error.message && (error.message.includes('Only credential-free') || error.message.includes('Private or metadata') || error.message.includes('Host resolves to a private address') || error.message.includes('Invalid URL'))) {
      return response.status(400).json({ success: false, error: { code: 'INVALID_URL', message: error.message } });
    }
    next(error);
  }
});

apiRouter.delete('/webhooks/:id', requirePermission('WEBHOOK_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await webhookService.deleteEndpoint(request.auth!.organizationId, request.params.id);
    response.json({ success: true, message: 'Webhook endpoint deleted' });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/webhooks/:id/ping', requirePermission('WEBHOOK_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const result = await webhookService.sendTestPing(request.auth!.organizationId, request.params.id);
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PHASE 8: ADMIN PLATFORM
// ==========================================

apiRouter.get('/admin/metrics', requirePlatformAdmin(), async (_request: AuthRequest, response, next) => {
  try {
    const metrics = await adminService.getAdminMetrics();
    response.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/admin/users', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const cursor = request.query.cursor as string | undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const search = request.query.search as string | undefined;
    const result = await adminService.listUsers({ cursor, limit, search });
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/admin/users/:id/status', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const { disabled, reason } = request.body;
    const ip = getClientIp(request);
    const user = await adminService.setUserDisabled(request.auth!.sub, request.params.id, Boolean(disabled), reason, ip);
    response.json({ success: true, data: { id: user.id, isDisabled: user.isDisabled } });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/admin/users/:id/revoke-sessions', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const ip = getClientIp(request);
    const count = await adminService.revokeUserSessions(request.auth!.sub, request.params.id, ip);
    response.json({ success: true, message: `Revoked ${count} active sessions` });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/admin/organizations', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const cursor = request.query.cursor as string | undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const search = request.query.search as string | undefined;
    const result = await adminService.listOrganizations({ cursor, limit, search });
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/admin/organizations/:id/status', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const { suspended, reason } = request.body;
    const ip = getClientIp(request);
    const org = await adminService.setOrganizationSuspended(request.auth!.sub, request.params.id, Boolean(suspended), reason, ip);
    response.json({ success: true, data: { id: org.id, isSuspended: org.isSuspended } });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/admin/audit-logs', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const cursor = request.query.cursor as string | undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const resourceType = request.query.resourceType as string | undefined;
    const result = await adminService.listAdminAuditLogs({ cursor, limit, resourceType });
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/admin/express-fix', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const cursor = request.query.cursor as string | undefined;
    const limit = request.query.limit ? Number(request.query.limit) : undefined;
    const status = request.query.status as string | undefined;
    const result = await adminService.listExpressFixQueue({ cursor, limit, status });
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/admin/express-fix/stats', requirePlatformAdmin(), async (_request: AuthRequest, response, next) => {
  try {
    const result = await adminService.getExpressFixQueueStats();
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/admin/express-fix/:id/status', requirePlatformAdmin(), async (request: AuthRequest, response, next) => {
  try {
    const { status, notes } = request.body;
    const ip = getClientIp(request);
    const updated = await adminService.transitionExpressFixStatus(
      request.auth!.sub,
      request.params.id,
      status,
      notes,
      ip
    );
    response.json({ success: true, data: { id: updated.id, status: updated.status } });
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: error.message } });
    }
    next(error);
  }
});

// ==========================================
// PHASE 8: SETTINGS & SECURITY
// ==========================================

apiRouter.get('/settings/profile', requirePermission('SETTINGS_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const profile = await settingsService.getProfile(request.auth!.sub);
    response.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/settings/profile', requirePermission('SETTINGS_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const { name, timezone, locale } = request.body;
    const profile = await settingsService.updateProfile(request.auth!.sub, { name, timezone, locale });
    response.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/settings/notifications', requirePermission('SETTINGS_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const prefs = await settingsService.getNotificationPreferences(request.auth!.sub, request.auth!.organizationId);
    response.json({ success: true, data: prefs });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/settings/notifications', requirePermission('SETTINGS_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const { eventTypes, enabled } = request.body;
    const prefs = await settingsService.updateNotificationPreferences(request.auth!.sub, request.auth!.organizationId, {
      eventTypes,
      enabled,
    });
    response.json({ success: true, data: prefs });
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/settings/sessions', requirePermission('SETTINGS_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const sessions = await settingsService.getActiveSessions(request.auth!.sub);
    response.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/settings/sessions/:id', requirePermission('SETTINGS_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await settingsService.revokeSession(request.auth!.sub, request.params.id);
    response.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// PHASE 8: TESTIMONIALS MODERATION
// ==========================================

apiRouter.get('/testimonials', requirePermission('TESTIMONIAL_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const status = request.query.status as string | undefined;
    const testimonials = await testimonialService.listTestimonials(request.auth!.organizationId, { status });
    response.json({ success: true, data: testimonials });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/testimonials', requirePermission('TESTIMONIAL_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const { authorName, companyName, role, content, rating, clientWorkspaceId } = request.body;
    const testimonial = await testimonialService.createTestimonial(request.auth!.organizationId, {
      authorName,
      companyName,
      role,
      content,
      rating,
      clientWorkspaceId,
    });
    response.status(201).json({ success: true, data: testimonial });
  } catch (error) {
    next(error);
  }
});

apiRouter.patch('/testimonials/:id/status', requirePermission('TESTIMONIAL_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    const { status } = request.body;
    const testimonial = await testimonialService.updateTestimonialStatus(request.auth!.organizationId, request.params.id, status);
    response.json({ success: true, data: testimonial });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/testimonials/:id', requirePermission('TESTIMONIAL_MANAGE'), async (request: AuthRequest, response, next) => {
  try {
    await testimonialService.deleteTestimonial(request.auth!.organizationId, request.params.id);
    response.json({ success: true, message: 'Testimonial deleted' });
  } catch (error) {
    next(error);
  }
});

