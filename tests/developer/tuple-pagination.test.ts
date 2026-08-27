import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';
import { decodeCursor } from '@leadguard/shared';

describe('Public API Deterministic (createdAt, id) Tuple Cursor Pagination', () => {
  let user: any;
  let org: any;
  let website: any;
  let apiKey: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `tuple-pag-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Tuple Pag Org', slug: `tuple-pag-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const keyRes = await apiKeyService.createApiKey(org.id, user.id, 'Pag Key', [
      'AUDIT_READ',
      'AUDIT_RUN',
    ]);
    apiKey = keyRes.rawKey;

    website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Pag Test Site',
        url: 'https://pag-test.com',
        domain: 'pag-test.com',
        normalizedUrl: 'https://pag-test.com',
      },
    });

    // Seed 5 audits with distinct timestamps
    for (let i = 0; i < 5; i++) {
      await db.audit.create({
        data: {
          organizationId: org.id,
          websiteId: website.id,
          status: 'COMPLETED',
          createdAt: new Date(Date.now() - (10 - i) * 10000),
        },
      });
    }
  });

  it('paginates deterministically across pages without skipping or duplicating rows', async () => {
    // Page 1: limit 2
    const res1 = await request(app)
      .get('/api/v1/public/audits?limit=2')
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res1.status).toBe(200);
    expect(res1.body.data.items).toHaveLength(2);
    expect(res1.body.meta.hasNextPage).toBe(true);
    expect(res1.body.meta.nextCursor).toBeDefined();

    const decoded = decodeCursor(res1.body.meta.nextCursor);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(res1.body.data.items[1].id);

    const cursor1 = res1.body.meta.nextCursor;

    // Simulate inserting a new audit at the top before fetching Page 2
    await db.audit.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        status: 'COMPLETED',
        createdAt: new Date(), // Newest
      },
    });

    // Page 2: with cursor from Page 1
    const res2 = await request(app)
      .get(`/api/v1/public/audits?limit=2&cursor=${cursor1}`)
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res2.status).toBe(200);
    expect(res2.body.data.items).toHaveLength(2);

    // Verify no duplicates between Page 1 and Page 2
    const page1Ids = res1.body.data.items.map((i: any) => i.id);
    const page2Ids = res2.body.data.items.map((i: any) => i.id);

    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }

    const cursor2 = res2.body.meta.nextCursor;

    // Page 3: with cursor from Page 2
    const res3 = await request(app)
      .get(`/api/v1/public/audits?limit=2&cursor=${cursor2}`)
      .set('Authorization', `Bearer ${apiKey}`);

    expect(res3.status).toBe(200);
    expect(res3.body.data.items).toHaveLength(1);
    expect(res3.body.meta.hasNextPage).toBe(false);
    expect(res3.body.meta.nextCursor).toBeNull();
  });
});
