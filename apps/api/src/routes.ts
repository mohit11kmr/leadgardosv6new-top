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
import { auditQueue } from './queue.js';
import { intelligenceService } from './services/intelligenceService.js';
import { apiKeyService } from './services/apiKeyService.js';
import { authSecurityService } from './services/authSecurityService.js';
import { toOrganizationDto, toUserDto, toWebsiteDto } from './dtos/index.js';
import { requirePermission } from './middleware/rbac.js';
import {
  authLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  auditCreationLimiter,
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
};

function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1'
  );
}

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
      // Possible token theft / replay attack: invalidate all user sessions
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
    const input = websiteSchema.parse(request.body);
    const url = await validateExternalUrl(input.url);
    const normalizedUrl = url.toString().replace(/\/$/, '');
    const website = await db.website.create({
      data: {
        organizationId: request.auth!.organizationId,
        name: input.name,
        url: input.url,
        normalizedUrl,
        domain: url.hostname,
      },
    });
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

    await auditQueue.add('audit:create', { auditId: audit.id }, { jobId: audit.id });
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
        findings: { orderBy: { severity: 'asc' } },
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
