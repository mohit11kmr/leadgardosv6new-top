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
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
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
   * Checks Redis rate limiting for an API key (e.g. 60 requests per minute)
   */
  async checkRateLimit(
    apiKeyId: string,
    limit = 60,
    windowSec = 60
  ): Promise<{ allowed: boolean; remaining: number; reset: number }> {
    const key = `ratelimit:apikey:${apiKeyId}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, windowSec);
    }

    const ttl = await redis.ttl(key);
    const remaining = Math.max(0, limit - current);

    return {
      allowed: current <= limit,
      remaining,
      reset: ttl > 0 ? ttl : windowSec,
    };
  }

  /**
   * Asynchronously records API usage
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
   * Middleware requiring a valid API key with specified scope
   */
  requireScope(requiredScope?: ApiScope) {
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

      // Check Rate Limit
      const rateLimit = await this.checkRateLimit(key.id);
      res.setHeader('X-RateLimit-Limit', '60');
      res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
      res.setHeader('X-RateLimit-Reset', rateLimit.reset.toString());

      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', rateLimit.reset.toString());
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `API rate limit exceeded. Try again in ${rateLimit.reset} seconds.`,
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

      // Track usage on response finish
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
