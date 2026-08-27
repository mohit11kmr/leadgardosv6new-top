import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from '@leadguard/database';
import { config } from '@leadguard/config';
import { createAccessToken, createRefreshToken, hashPassword, hashRefreshToken, verifyPassword } from './auth.js';
import { validateExternalUrl } from './security.js';
import { auditQueue } from './queue.js';

const authSchema = z.object({ email: z.string().email().transform((v) => v.toLowerCase()), password: z.string().min(12), organizationName: z.string().min(2).max(100).optional() });
const websiteSchema = z.object({ name: z.string().min(1).max(100), url: z.string().url() });

type Claims = { sub: string; organizationId: string };
export type AuthRequest = Request & { auth?: Claims; params: { id: string } };
export function requireAuth(request: AuthRequest, response: Response, next: NextFunction) { const token = request.header('authorization')?.replace(/^Bearer\s+/i, ''); if (!token) return response.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required', requestId: request.header('x-request-id') ?? '' } }); try { request.auth = jwt.verify(token, config.JWT_SECRET) as Claims; next(); } catch { response.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid access token', requestId: request.header('x-request-id') ?? '' } }); } }
async function member(request: AuthRequest) { if (!request.auth) return null; return db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: request.auth.organizationId, userId: request.auth.sub } } }); }
const roleRank = { VIEWER: 0, MEMBER: 1, AGENCY_MEMBER: 1, ADMIN: 2, AGENCY_ADMIN: 2, OWNER: 3 } as const;
function requireRole(minimum: keyof typeof roleRank) { return async (request: AuthRequest, response: Response, next: NextFunction) => { const current = await member(request); if (!current || roleRank[current.role] < roleRank[minimum]) return response.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient organization permission', requestId: requestId(request) } }); next(); }; }
function requestId(request: Request) { return request.header('x-request-id') ?? randomUUID(); }

export const apiRouter = Router();
apiRouter.post('/auth/register', async (request, response, next) => { try { const input = authSchema.parse(request.body); const passwordHash = await hashPassword(input.password); const user = await db.user.create({ data: { email: input.email, passwordHash } }); const organization = await db.organization.create({ data: { name: input.organizationName ?? 'My Workspace', slug: `${input.email.split('@')[0]}-${randomUUID().slice(0, 8)}`, members: { create: { userId: user.id, role: 'OWNER' } } } }); const refreshToken = createRefreshToken(); await db.session.create({ data: { userId: user.id, refreshTokenHash: hashRefreshToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400000) } }); response.status(201).json({ success: true, data: { user: { id: user.id, email: user.email }, organization: { id: organization.id, name: organization.name }, accessToken: createAccessToken(user.id, organization.id), refreshToken } }); } catch (error) { next(error); } });
apiRouter.post('/auth/login', async (request, response, next) => { try { const input = authSchema.pick({ email: true, password: true }).parse(request.body); const user = await db.user.findUnique({ where: { email: input.email }, include: { memberships: true } }); if (!user || !(await verifyPassword(user.passwordHash, input.password)) || !user.memberships[0]) return response.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect', requestId: requestId(request) } }); const organizationId = user.memberships[0].organizationId; const refreshToken = createRefreshToken(); await db.session.create({ data: { userId: user.id, refreshTokenHash: hashRefreshToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400000) } }); response.json({ success: true, data: { accessToken: createAccessToken(user.id, organizationId), refreshToken } }); } catch (error) { next(error); } });
apiRouter.post('/auth/refresh', async (request, response, next) => { try { const token = z.object({ refreshToken: z.string().min(20) }).parse(request.body).refreshToken; const session = await db.session.findUnique({ where: { refreshTokenHash: hashRefreshToken(token) }, include: { user: { include: { memberships: true } } } }); if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.memberships[0]) return response.status(401).json({ success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid', requestId: requestId(request) } }); const replacement = createRefreshToken(); await db.$transaction([db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }), db.session.create({ data: { userId: session.userId, refreshTokenHash: hashRefreshToken(replacement), expiresAt: new Date(Date.now() + 30 * 86400000) } })]); response.json({ success: true, data: { accessToken: createAccessToken(session.userId, session.user.memberships[0].organizationId), refreshToken: replacement } }); } catch (error) { next(error); } });
apiRouter.post('/auth/logout', requireAuth, async (request: AuthRequest, response, next) => { try { const token = z.object({ refreshToken: z.string() }).parse(request.body).refreshToken; await db.session.updateMany({ where: { userId: request.auth!.sub, refreshTokenHash: hashRefreshToken(token) }, data: { revokedAt: new Date() } }); response.status(204).send(); } catch (error) { next(error); } });

apiRouter.use(requireAuth);
apiRouter.get('/organizations', async (request: AuthRequest, response, next) => { try { const organizations = await db.organization.findMany({ where: { deletedAt: null, members: { some: { userId: request.auth!.sub } } }, select: { id: true, name: true, slug: true } }); response.json({ success: true, data: { activeOrganizationId: request.auth!.organizationId, organizations } }); } catch (error) { next(error); } });
apiRouter.post('/organizations', async (request: AuthRequest, response, next) => { try { const input = z.object({ name: z.string().min(2).max(100), slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(60) }).parse(request.body); const organization = await db.organization.create({ data: { ...input, members: { create: { userId: request.auth!.sub, role: 'OWNER' } } }, select: { id: true, name: true, slug: true } }); response.status(201).json({ success: true, data: organization }); } catch (error) { next(error); } });
apiRouter.post('/organizations/:id/switch', async (request: AuthRequest, response, next) => { try { const membership = await db.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: String(request.params.id), userId: request.auth!.sub } } }); if (!membership) return response.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Organization membership required', requestId: requestId(request) } }); response.json({ success: true, data: { accessToken: createAccessToken(request.auth!.sub, membership.organizationId), organizationId: membership.organizationId } }); } catch (error) { next(error); } });
apiRouter.get('/websites', async (request: AuthRequest, response, next) => { try { const websites = await db.website.findMany({ where: { organizationId: request.auth!.organizationId, deletedAt: null }, orderBy: { createdAt: 'desc' } }); response.json({ success: true, data: websites }); } catch (error) { next(error); } });
apiRouter.post('/websites', requireRole('MEMBER'), async (request: AuthRequest, response, next) => { try { const input = websiteSchema.parse(request.body); const url = await validateExternalUrl(input.url); const normalizedUrl = url.toString().replace(/\/$/, ''); const website = await db.website.create({ data: { organizationId: request.auth!.organizationId, name: input.name, url: input.url, normalizedUrl, domain: url.hostname } }); response.status(201).json({ success: true, data: website }); } catch (error) { next(error); } });
apiRouter.get('/websites/:id', async (request: AuthRequest, response, next) => { try { const website = await db.website.findFirst({ where: { id: String(request.params.id), organizationId: request.auth!.organizationId, deletedAt: null }, include: { audits: { orderBy: { createdAt: 'desc' }, take: 10, include: { score: true } } } }); if (!website) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) } }); response.json({ success: true, data: website }); } catch (error) { next(error); } });
apiRouter.delete('/websites/:id', async (request: AuthRequest, response, next) => { try { const result = await db.website.updateMany({ where: { id: String(request.params.id), organizationId: request.auth!.organizationId, deletedAt: null }, data: { deletedAt: new Date(), status: 'ARCHIVED' } }); if (!result.count) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) } }); response.status(204).send(); } catch (error) { next(error); } });
apiRouter.patch('/websites/:id', async (request: AuthRequest, response, next) => { try { const input = z.object({ name: z.string().min(1).max(100), url: z.string().url() }).parse(request.body); const url = await validateExternalUrl(input.url); const result = await db.website.updateMany({ where: { id: String(request.params.id), organizationId: request.auth!.organizationId, deletedAt: null }, data: { name: input.name, url: input.url, normalizedUrl: url.toString().replace(/\/$/, ''), domain: url.hostname } }); if (!result.count) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) } }); const website = await db.website.findFirst({ where: { id: String(request.params.id), organizationId: request.auth!.organizationId } }); response.json({ success: true, data: website }); } catch (error) { next(error); } });

apiRouter.post('/audits', requireRole('MEMBER'), async (request: AuthRequest, response, next) => { try { const input = z.object({ websiteId: z.string().uuid(), idempotencyKey: z.string().min(8).max(100).optional() }).parse(request.body); const website = await db.website.findFirst({ where: { id: input.websiteId, organizationId: request.auth!.organizationId, deletedAt: null } }); if (!website) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Website not found', requestId: requestId(request) } }); if (input.idempotencyKey) { const existing = await db.audit.findFirst({ where: { organizationId: request.auth!.organizationId, websiteId: website.id, idempotencyKey: input.idempotencyKey } }); if (existing) return response.status(200).json({ success: true, data: existing, meta: { idempotent: true } }); } let audit; try { audit = await db.audit.create({ data: { organizationId: request.auth!.organizationId, websiteId: website.id, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}) } }); } catch (error) { if ((error as { code?: string }).code !== 'P2002' || !input.idempotencyKey) throw error; audit = await db.audit.findFirstOrThrow({ where: { organizationId: request.auth!.organizationId, websiteId: website.id, idempotencyKey: input.idempotencyKey } }); return response.status(200).json({ success: true, data: audit, meta: { idempotent: true } }); } await auditQueue.add('audit:create', { auditId: audit.id }, { jobId: audit.id }); response.status(202).json({ success: true, data: audit }); } catch (error) { next(error); } });
apiRouter.get('/audits', async (request: AuthRequest, response, next) => { try { const audits = await db.audit.findMany({ where: { organizationId: request.auth!.organizationId }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(request.query.limit) || 25, 100), include: { website: true, score: true } }); response.json({ success: true, data: audits }); } catch (error) { next(error); } });
apiRouter.get('/audits/:id', async (request: AuthRequest, response, next) => { try { const audit = await db.audit.findFirst({ where: { id: request.params.id, organizationId: request.auth!.organizationId }, include: { website: true, score: true, findings: { orderBy: { severity: 'asc' } } } }); if (!audit) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) } }); response.json({ success: true, data: audit }); } catch (error) { next(error); } });
apiRouter.get('/audits/:id/progress', async (request: AuthRequest, response, next) => { try { const audit = await db.audit.findFirst({ where: { id: request.params.id, organizationId: request.auth!.organizationId }, select: { id: true, status: true, progress: true, progressStage: true } }); if (!audit) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) } }); response.json({ success: true, data: audit }); } catch (error) { next(error); } });
apiRouter.get('/audits/:id/findings', async (request: AuthRequest, response, next) => {
  try {
    const filters = z.object({
      category: z.enum(['LEAD', 'ADVERTISING', 'SEO', 'SECURITY']).optional(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).optional(),
      scope: z.enum(['PAGE', 'WEBSITE', 'AUDIT']).optional(),
      ruleId: z.string().regex(/^LG-\d{3}$/).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      cursor: z.string().uuid().optional(),
    }).parse(request.query);

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

apiRouter.get('/audits/:id/pages', async (request: AuthRequest, response, next) => {
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

apiRouter.get('/audits/:id/runs', async (request: AuthRequest, response, next) => {
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

apiRouter.get('/audits/:id/score', async (request: AuthRequest, response, next) => { try { const audit = await db.audit.findFirst({ where: { id: request.params.id, organizationId: request.auth!.organizationId }, include: { score: true } }); if (!audit) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) } }); response.json({ success: true, data: audit.score }); } catch (error) { next(error); } });
apiRouter.get('/audits/:id/business-impact', async (request: AuthRequest, response, next) => { try { const audit = await db.audit.findFirst({ where: { id: String(request.params.id), organizationId: request.auth!.organizationId }, select: { businessImpact: true } }); if (!audit) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) } }); response.json({ success: true, data: audit.businessImpact }); } catch (error) { next(error); } });
apiRouter.get('/audits/:id/summary', async (request: AuthRequest, response, next) => { try { const audit = await db.audit.findFirst({ where: { id: String(request.params.id), organizationId: request.auth!.organizationId }, select: { executiveSummary: true } }); if (!audit) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Audit not found', requestId: requestId(request) } }); response.json({ success: true, data: audit.executiveSummary }); } catch (error) { next(error); } });
apiRouter.post('/audits/:id/cancel', async (request: AuthRequest, response, next) => { try { const result = await db.audit.updateMany({ where: { id: request.params.id, organizationId: request.auth!.organizationId, status: { in: ['QUEUED', 'RUNNING'] } }, data: { status: 'CANCELLED', progressStage: 'cancelled' } }); if (!result.count) return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cancellable audit not found', requestId: requestId(request) } }); response.status(202).json({ success: true, data: { cancelled: true } }); } catch (error) { next(error); } });
