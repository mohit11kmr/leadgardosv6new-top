import type { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { getClientIp } from '@leadguard/shared';

export const redisClient = new Redis(config.REDIS_URL);
const isTest = process.env.NODE_ENV === 'test';

export function createRedisRateLimiter(options: {
  keyPrefix: string;
  windowMs: number;
  limit: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}) {
  const { keyPrefix, windowMs, limit, message = 'Rate limit exceeded' } = options;
  const effectiveLimit = isTest ? Math.max(limit * 20, 100) : limit;

  const keyGen =
    options.keyGenerator ||
    ((req: Request) => getClientIp(req));

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientKey = keyGen(req);
      const redisKey = `ratelimit:${keyPrefix}:${clientKey}`;
      const now = Date.now();
      const clearBefore = now - windowMs;

      const multi = redisClient.multi();
      multi.zremrangebyscore(redisKey, 0, clearBefore);
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);
      multi.zcard(redisKey);
      multi.pexpire(redisKey, windowMs);

      const results = await multi.exec();
      const count = (results?.[2]?.[1] as number) || 1;

      res.setHeader('X-RateLimit-Limit', String(effectiveLimit));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, effectiveLimit - count)));

      if (count > effectiveLimit) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
            requestId: req.header('x-request-id') || '',
          },
        });
      }

      next();
    } catch {
      // Fail-safe rate limiting: never silently disable limits when the
      // rate-limit store (Redis) is unavailable. Return a controlled
      // infrastructure response instead of allowing unbounded traffic.
      if (config.NODE_ENV === 'test') {
        next();
        return;
      }
      res.status(503).json({
        success: false,
        error: {
          code: 'RATE_LIMITER_UNAVAILABLE',
          message: 'Rate limiting is temporarily unavailable. Please retry shortly.',
          requestId: req.header('x-request-id') || '',
        },
      });
    }
  };
}

export const authLimiter = createRedisRateLimiter({
  keyPrefix: 'auth',
  windowMs: 60 * 1000,
  limit: config.AUTH_RATE_LIMIT,
  message: 'Too many authentication attempts. Please try again later.',
});

export const passwordResetLimiter = createRedisRateLimiter({
  keyPrefix: 'password_reset',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'Too many password reset requests. Please wait before retrying.',
});

export const emailVerificationLimiter = createRedisRateLimiter({
  keyPrefix: 'email_verification',
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'Too many verification requests. Please wait before retrying.',
});

export const auditCreationLimiter = createRedisRateLimiter({
  keyPrefix: 'audit_creation',
  windowMs: 60 * 1000,
  limit: config.AUDIT_RATE_LIMIT,
  message: 'Audit execution rate limit reached for this window.',
});

export const apiLimiter = createRedisRateLimiter({
  keyPrefix: 'general_api',
  windowMs: 60 * 1000,
  limit: config.API_RATE_LIMIT,
  message: 'API rate limit exceeded.',
});

export const webhookLimiter = createRedisRateLimiter({
  keyPrefix: 'webhook',
  windowMs: 60 * 1000,
  limit: config.WEBHOOK_RATE_LIMIT,
  message: 'Webhook rate limit exceeded.',
});
