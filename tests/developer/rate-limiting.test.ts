import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';

describe('Public API Rate Limiting Gate (Requirement 14)', () => {
  let user: any;
  let org: any;
  let apiKey: string;
  let keyId: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `ratelimit-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Rate Limit Org', slug: `rl-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const keyRes = await apiKeyService.createApiKey(org.id, user.id, 'Rate Limit Key', [
      'AUDIT_READ',
      'AUDIT_RUN',
    ]);
    apiKey = keyRes.rawKey;
    keyId = keyRes.apiKey.id;
  });

  it('includes rate limit headers in public API responses', async () => {
    const res = await request(app)
      .get('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('enforces rate limit boundaries and returns 429 RATE_LIMIT_EXCEEDED when quota is exhausted', async () => {
    // For testing, trigger multiple audit run requests beyond key limit (10)
    for (let i = 0; i < 10; i++) {
      await apiKeyService.checkRateLimit(keyId, org.id, 'AUDIT_RUN');
    }

    const res = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers['retry-after']).toBeDefined();
  });
});
