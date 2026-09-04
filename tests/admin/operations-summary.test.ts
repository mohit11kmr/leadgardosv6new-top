import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

async function makePlatformAdmin(capabilities: string[]) {
  const user = await db.user.create({
    data: { email: `ops_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`, passwordHash: 'hash', platformAdmin: true, platformCapabilities: capabilities },
  });
  const org = await db.organization.create({ data: { name: `Ops Org ${user.id}`, slug: `ops-org-${user.id}` } });
  const token = createAccessToken(user.id, org.id);
  return { token };
}

describe('GET /admin/operations/summary', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/admin/operations/summary');
    expect(res.status).toBe(401);
  });

  it('rejects a platformAdmin without OPERATIONS_VIEW', async () => {
    const { token } = await makePlatformAdmin([]);
    const res = await request(app).get('/api/v1/admin/operations/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns real job-count summaries for every real queue, never a hardcoded/fake list', async () => {
    const { token } = await makePlatformAdmin(['OPERATIONS_VIEW']);
    const res = await request(app).get('/api/v1/admin/operations/summary').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.data.queues.map((q: any) => q.name);
    expect(names).toContain('audit');
    expect(names).toContain('webhook');
    expect(names).toContain('monitoring');
    for (const q of res.body.data.queues) {
      expect(typeof q.waiting).toBe('number');
      expect(typeof q.active).toBe('number');
      expect(typeof q.failed).toBe('number');
    }
    expect(res.body.data.asOf).toBeDefined();
  });
});
