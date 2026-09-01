process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL = 'redis://localhost:16380';
process.env.JWT_SECRET = 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);
process.env.APP_URL = 'http://localhost:5173';
process.env.API_URL = 'http://localhost:4000';

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../apps/api/src/server.js';
import { redisClient } from '../apps/api/src/middleware/rateLimiters.js';

const CACHE_KEY = 'public:platform-stats';

describe('GET /public/stats (real platform social-proof numbers)', () => {
  beforeEach(async () => {
    await redisClient.del(CACHE_KEY);
  });

  it('is unauthenticated and reflects the true live DB counts (not a fixed/fake number)', async () => {
    // Add a real, verifiable completed audit + finding + enabled monitor.
    const org = await db.organization.create({
      data: { name: `Stats Org ${Date.now()}`, slug: `stats-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: { organizationId: org.id, name: 'Stats Site', url: 'https://stats-test.example', normalizedUrl: 'https://stats-test.example', domain: 'stats-test.example' },
    });
    const audit = await db.audit.create({ data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED' } });
    await db.auditFinding.create({
      data: {
        auditId: audit.id,
        ruleId: 'LG-001',
        internalKey: 'STATS_TEST',
        normalizedIssueKey: 'STATS_TEST',
        category: 'LEAD',
        scope: 'WEBSITE',
        severity: 'LOW',
        title: 'Stats test finding',
        description: 'desc',
        evidence: { source: 'test', observed: '', location: '', why: '', recommendation: '' },
        recommendation: 'rec',
        scoreImpact: 1,
      },
    });
    await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: website.id, enabled: true, frequency: 'HOURLY' },
    });

    // Ground truth, computed independently of the endpoint/service.
    const [expectedAudits, expectedFindings, expectedMonitors] = await Promise.all([
      db.audit.count({ where: { status: 'COMPLETED' } }),
      db.auditFinding.count(),
      db.monitoringConfig.count({ where: { enabled: true, archivedAt: null } }),
    ]);

    const res = await request(app).get('/api/v1/public/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalAuditsCompleted).toBe(expectedAudits);
    expect(res.body.data.totalIssuesFound).toBe(expectedFindings);
    expect(res.body.data.websitesMonitored).toBe(expectedMonitors);
  });

  it('caches the result across requests within the TTL (does not re-query every call)', async () => {
    const first = await request(app).get('/api/v1/public/stats');
    expect(first.status).toBe(200);

    // Add new data without invalidating the cache.
    const org = await db.organization.create({
      data: { name: `Stats Cache Org ${Date.now()}`, slug: `stats-cache-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: { organizationId: org.id, name: 'Stats Cache Site', url: 'https://stats-cache.example', normalizedUrl: 'https://stats-cache.example', domain: 'stats-cache.example' },
    });
    await db.audit.create({ data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED' } });

    const second = await request(app).get('/api/v1/public/stats');
    expect(second.body.data.totalAuditsCompleted).toBe(first.body.data.totalAuditsCompleted);

    // After invalidating the cache, the new audit is reflected.
    await redisClient.del(CACHE_KEY);
    const third = await request(app).get('/api/v1/public/stats');
    expect(third.body.data.totalAuditsCompleted).toBe(first.body.data.totalAuditsCompleted + 1);
  });
});
