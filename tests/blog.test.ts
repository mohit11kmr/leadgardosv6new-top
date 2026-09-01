process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
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
import { createAccessToken } from '../apps/api/src/auth.js';

describe('Blog / Content Hub', () => {
  let platformAdmin: any;
  let platformToken: string;
  let regularUser: any;
  let regularToken: string;

  beforeEach(async () => {
    platformAdmin = await db.user.create({
      data: { email: `blog-admin-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash', platformAdmin: true },
    });
    const adminOrg = await db.organization.create({ data: { name: 'Blog Admin Org', slug: `blog-admin-org-${Date.now()}-${Math.random()}` } });
    platformToken = createAccessToken(platformAdmin.id, adminOrg.id);

    regularUser = await db.user.create({
      data: { email: `blog-regular-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    const regularOrg = await db.organization.create({ data: { name: 'Blog Regular Org', slug: `blog-regular-org-${Date.now()}-${Math.random()}` } });
    await db.organizationMember.create({ data: { organizationId: regularOrg.id, userId: regularUser.id, role: 'OWNER' } });
    regularToken = createAccessToken(regularUser.id, regularOrg.id);
  });

  it('rejects a non-platform-admin from creating a post', async () => {
    const res = await request(app)
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${regularToken}`)
      .send({ title: 'Should Fail', content: 'body' });
    expect(res.status).toBe(403);
  });

  it('lets a platform admin create, publish, list, and read a post; and it is invisible publicly until published', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ title: 'How LeadGuard Finds Lost Leads', content: 'Full article body here.', excerpt: 'Short summary.' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.slug).toBe('how-leadguard-finds-lost-leads');
    expect(createRes.body.data.status).toBe('DRAFT');
    const postId = createRes.body.data.id;
    const slug = createRes.body.data.slug;

    // DRAFT post is not visible on the public endpoints yet
    const publicListBeforePublish = await request(app).get('/api/v1/public/blog');
    expect(publicListBeforePublish.body.data.items.some((p: any) => p.id === postId)).toBe(false);

    const publicGetBeforePublish = await request(app).get(`/api/v1/public/blog/${slug}`);
    expect(publicGetBeforePublish.status).toBe(404);

    // Publish it
    const publishRes = await request(app)
      .patch(`/api/v1/admin/blog/${postId}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ status: 'PUBLISHED' });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.status).toBe('PUBLISHED');
    expect(publishRes.body.data.publishedAt).toBeTruthy();

    // Now it's publicly visible
    const publicList = await request(app).get('/api/v1/public/blog');
    expect(publicList.status).toBe(200);
    expect(publicList.body.data.items.some((p: any) => p.id === postId)).toBe(true);

    const publicGet = await request(app).get(`/api/v1/public/blog/${slug}`);
    expect(publicGet.status).toBe(200);
    expect(publicGet.body.data.content).toBe('Full article body here.');

    // Admin can update it
    const updateRes = await request(app)
      .patch(`/api/v1/admin/blog/${postId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ title: 'How LeadGuard Finds Lost Leads (Updated)' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toContain('Updated');

    // Admin can delete it
    const deleteRes = await request(app)
      .delete(`/api/v1/admin/blog/${postId}`)
      .set('Authorization', `Bearer ${platformToken}`);
    expect(deleteRes.status).toBe(200);

    const publicGetAfterDelete = await request(app).get(`/api/v1/public/blog/${slug}`);
    expect(publicGetAfterDelete.status).toBe(404);
  });

  it('rejects a duplicate slug with 400', async () => {
    await request(app)
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ title: 'Duplicate Slug Test', content: 'body' });

    const res = await request(app)
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ title: 'Duplicate Slug Test', content: 'other body' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/blog')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });
});
