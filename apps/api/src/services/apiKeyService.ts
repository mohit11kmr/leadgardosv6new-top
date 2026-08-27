import { randomBytes, createHash } from 'node:crypto';
import { db } from '@leadguard/database';
import { hashApiKey, recordSecurityEvent } from '../auth.js';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import type { Request, Response, NextFunction } from 'express';

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export type ApiScope =
  | 'AUDIT_READ'
  | 'AUDIT_RUN'
  | 'REPORT_READ'
  | 'MONITORING_READ'
  | 'MONITORING_RUN'
  | 'WEBSITE_READ';

export type RateLimitCategory = 'AUDIT_RUN' | 'MONITORING_RUN' | 'READ';

export const RATE_LIMITS: Record<RateLimitCategory, { keyLimit: number; orgLimit: number; windowSec: number }> = {
  AUDIT_RUN: { keyLimit: 10, orgLimit: 30, windowSec: 60 },
  MONITORING_RUN: { keyLimit: 15, orgLimit: 45, windowSec: 60 },
  READ: { keyLimit: 120, orgLimit: 300, windowSec: 60 },
};

export const VALID_SCOPES: ApiScope[] = [
  'AUDIT_READ',
  'AUDIT_RUN',
  'REPORT_READ',
  'MONITORING_READ',
  'MONITORING_RUN',
  'WEBSITE_READ',
];

export interface AuthenticatedApiKey {
  id: string;
  organizationId: string;
  name: string;
  scopes: string[];
}

export class ApiKeyService {
  /**
   * Creates an API key with scoped permissions and SHA-256 hash
   */
  async createApiKey(
    organizationId: string,
    userId: string,
    name: string,
    scopes: string[] = ['AUDIT_READ', 'REPORT_READ'],
    expiresInDays = 365
  ) {
    // Validate scopes
    const normalizedScopes = scopes.filter((s) =>
      VALID_SCOPES.includes(s as ApiScope)
    );
    if (normalizedScopes.length === 0) {
      normalizedScopes.push('AUDIT_READ');
    }

    const rawSecret = randomBytes(24).toString('hex');
    const rawKey = `lg_live_${rawSecret}`;
    const keyPrefix = rawKey.slice(0, 16);
    const keyHash = hashApiKey(rawKey);
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000);

    const apiKey = await db.apiKey.create({
      data: {
        organizationId,
        name,
        keyPrefix,
        keyHash,
        scopes: normalizedScopes,
        expiresAt,
      },
    });

    await recordSecurityEvent('API_KEY_CREATED', userId, null, {
      organizationId,
      apiKeyId: apiKey.id,
      keyPrefix,
    });

    return {
      apiKey,
      rawKey, // Returned ONLY upon creation
    };
  }

  /**
   * Lists active API keys
   */
  async listApiKeys(organizationId: string) {
    return db.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revokes an API key
   */
  async revokeApiKey(id: string, organizationId: string, userId: string) {
    const result = await db.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count > 0) {
      await recordSecurityEvent('API_KEY_REVOKED', userId, null, {
        organizationId,
        apiKeyId: id,
      });
    }

    return result.count > 0;
  }

  /**
   * Verifies an API key token
   */
  async verifyApiKey(rawKey: string): Promise<AuthenticatedApiKey | null> {
    if (!rawKey || !rawKey.startsWith('lg_live_')) return null;
    const keyHash = hashApiKey(rawKey);

    const key = await db.apiKey.findUnique({
      where: { keyHash },
    });

    if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) {
      return null;
    }

    // Update lastUsedAt asynchronously
    db.apiKey
      .update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      id: key.id,
      organizationId: key.organizationId,
      name: key.name,
      scopes: key.scopes,
    };
  }

  /**
   * Checks Redis rate limiting for an API key and Organization (per category)
   */
  async checkRateLimit(
    apiKeyId: string,
    organizationId: string,
    category: RateLimitCategory = 'READ'
  ): Promise<{ allowed: boolean; remaining: number; reset: number; limit: number }> {
    const configLimits = RATE_LIMITS[category] || RATE_LIMITS.READ;
    const keyKey = `ratelimit:apikey:${apiKeyId}:${category}`;
    const orgKey = `ratelimit:org:${organizationId}:${category}`;

    const [keyCount, orgCount] = await Promise.all([
      redis.incr(keyKey),
      redis.incr(orgKey),
    ]);

    if (keyCount === 1) {
      await redis.expire(keyKey, configLimits.windowSec);
    }
    if (orgCount === 1) {
      await redis.expire(orgKey, configLimits.windowSec);
    }

    const ttl = await redis.ttl(keyKey);
    const remainingKey = Math.max(0, configLimits.keyLimit - keyCount);
    const remainingOrg = Math.max(0, configLimits.orgLimit - orgCount);
    const remaining = Math.min(remainingKey, remainingOrg);

    const allowed = keyCount <= configLimits.keyLimit && orgCount <= configLimits.orgLimit;

    return {
      allowed,
      remaining,
      reset: ttl > 0 ? ttl : configLimits.windowSec,
      limit: configLimits.keyLimit,
    };
  }

  /**
   * Asynchronously records API usage (data minimization - no secrets or auth tokens)
   */
  async recordUsage(data: {
    organizationId: string;
    apiKeyId?: string;
    endpoint: string;
    method: string;
    statusCode: number;
    latencyMs: number;
    ipAddress?: string;
  }) {
    try {
      await db.apiUsage.create({
        data: {
          organizationId: data.organizationId,
          apiKeyId: data.apiKeyId,
          endpoint: data.endpoint,
          method: data.method,
          statusCode: data.statusCode,
          latencyMs: data.latencyMs,
          ipAddress: data.ipAddress,
        },
      });
    } catch {
      // Usage tracking failure should not disrupt API responses
    }
  }

  /**
   * Middleware requiring a valid API key with specified scope and category-based rate limits
   */
  requireScope(requiredScope?: ApiScope, category: RateLimitCategory = 'READ') {
    return async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const authHeader = req.headers.authorization;
      const customKeyHeader = req.headers['x-api-key'] as string | undefined;

      let token: string | undefined;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (customKeyHeader) {
        token = customKeyHeader.trim();
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'API key required. Provide via Authorization Bearer or X-API-Key header.',
          },
        });
      }

      const key = await this.verifyApiKey(token);
      if (!key) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' },
        });
      }

      // Check Rate Limit (Key-level + Org-level)
      const rateLimit = await this.checkRateLimit(key.id, key.organizationId, category);
      res.setHeader('X-RateLimit-Limit', rateLimit.limit.toString());
      res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
      res.setHeader('X-RateLimit-Reset', rateLimit.reset.toString());

      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', rateLimit.reset.toString());
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `API rate limit exceeded for ${category}. Try again in ${rateLimit.reset} seconds.`,
          },
        });
      }

      // Check Scope
      if (requiredScope && !key.scopes.includes(requiredScope)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: `API key lacks required scope: ${requiredScope}`,
          },
        });
      }

      (req as any).apiKey = key;
      (req as any).organizationId = key.organizationId;

      // Track sanitized usage on response finish
      res.on('finish', () => {
        const latencyMs = Date.now() - startTime;
        this.recordUsage({
          organizationId: key.organizationId,
          apiKeyId: key.id,
          endpoint: req.baseUrl + req.path,
          method: req.method,
          statusCode: res.statusCode,
          latencyMs,
          ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || undefined,
        });
      });

      next();
    };
  }
}

export const apiKeyService = new ApiKeyService();
