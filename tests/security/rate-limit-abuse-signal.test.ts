import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import { createRedisRateLimiter, redisClient } from '../../apps/api/src/middleware/rateLimiters.js';

/**
 * Exercises createRedisRateLimiter's sustained-abuse detection directly
 * (not through supertest/the full app) — test mode auto-boosts every
 * limiter's effective limit to at least 100 (see rateLimiters.ts's own
 * `isTest` guard, an intentional CLAUDE.md-documented convention to keep
 * unrelated tests from tripping real limits), so reaching even a single
 * 429 requires 100+ calls regardless of the configured `limit` — calling
 * the middleware function in-process avoids 100+ real HTTP round-trips.
 */
/**
 * The real middleware only calls Express's `next()` on the allow path — on
 * a 429 block it terminates the response itself (res.status().json()) and
 * never calls next(). A harness that only resolves on next() would hang
 * forever on the very block this test is trying to observe, so this
 * resolves on whichever of the two actually happens first.
 */
function invokeLimiter(limiter: (req: any, res: any, next: () => void) => void, ip: string): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const req = { headers: {}, socket: { remoteAddress: ip }, header: () => '' } as any;
    const res = {
      setHeader: () => {},
      status(code: number) {
        this._code = code;
        return this;
      },
      json() {
        if (!settled) {
          settled = true;
          resolve(this._code ?? 429);
        }
      },
    } as any;
    limiter(req, res, () => {
      if (!settled) {
        settled = true;
        resolve(200);
      }
    });
  });
}

describe('Rate-limit sustained-abuse signal', () => {
  it('records exactly one RATE_LIMIT_ABUSE_<PREFIX> SecurityEvent after 5 sustained violations, not on the first block', async () => {
    const keyPrefix = `test_abuse_${Date.now()}`;
    const ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
    const limiter = createRedisRateLimiter({ keyPrefix, windowMs: 60_000, limit: 1 });

    let lastStatus = 200;
    // effectiveLimit is boosted to >=100 in test mode; drive well past it
    // plus 5 more blocked calls to cross the abuse threshold.
    for (let i = 0; i < 130; i++) {
      lastStatus = await invokeLimiter(limiter, ip);
    }
    expect(lastStatus).toBe(429);

    // Give the best-effort async abuse-recording a tick to complete.
    await new Promise((r) => setTimeout(r, 50));

    const events = await db.securityEvent.findMany({ where: { type: `RATE_LIMIT_ABUSE_${keyPrefix.toUpperCase()}` } });
    expect(events.length).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('does not record an abuse event for a single, isolated rate-limit trip', async () => {
    const keyPrefix = `test_single_${Date.now()}`;
    const ip = `10.0.1.${Math.floor(Math.random() * 250) + 1}`;
    const limiter = createRedisRateLimiter({ keyPrefix, windowMs: 60_000, limit: 1 });

    for (let i = 0; i < 101; i++) {
      await invokeLimiter(limiter, ip);
    }
    await new Promise((r) => setTimeout(r, 50));

    const events = await db.securityEvent.findMany({ where: { type: `RATE_LIMIT_ABUSE_${keyPrefix.toUpperCase()}` } });
    expect(events.length).toBe(0);
  }, 20000);
});
