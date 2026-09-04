import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { db } from '@leadguard/database';
import { createAccessToken } from '../../apps/api/src/auth.js';

// Regression for the audit finding: these routes destructured request.body
// directly with no schema, so malformed input (wrong types, missing
// required fields, out-of-range values) fell straight through to the
// service layer instead of getting a clean 400.
describe('Input validation: previously-unvalidated mutating routes', () => {
  let user: any;
  let org: any;
  let token: string;
  let platformAdmin: any;
  let platformToken: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `validation-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Validation Org', slug: `validation-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    token = createAccessToken(user.id, org.id);

    platformAdmin = await db.user.create({
      data: { email: `platform-validation-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash', platformAdmin: true, platformRole: 'OWNER' },
    });
    platformToken = createAccessToken(platformAdmin.id, org.id);
  });

  it('POST /webhooks rejects a non-URL "url" field with 400', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'not-a-valid-url', events: ['*'] });
    expect(res.status).toBe(400);
  });

  it('POST /webhooks rejects a missing "url" field with 400', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'no url here' });
    expect(res.status).toBe(400);
  });

  it('POST /testimonials rejects a numeric "rating" outside 1-5 with 400', async () => {
    const res = await request(app)
      .post('/api/v1/testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({ authorName: 'Jane', content: 'Great product', rating: 99 });
    expect(res.status).toBe(400);
  });

  it('POST /testimonials rejects an object passed as "rating" with 400 instead of an opaque 500', async () => {
    const res = await request(app)
      .post('/api/v1/testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({ authorName: 'Jane', content: 'Great product', rating: { not: 'a number' } });
    expect(res.status).toBe(400);
  });

  it('POST /testimonials rejects a missing "content" field with 400', async () => {
    const res = await request(app)
      .post('/api/v1/testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({ authorName: 'Jane' });
    expect(res.status).toBe(400);
  });

  it('PATCH /testimonials/:id/status rejects an unknown status value with 400', async () => {
    const testimonial = await db.testimonial.create({
      data: { organizationId: org.id, authorName: 'Jane', content: 'Great product' },
    });
    const res = await request(app)
      .patch(`/api/v1/testimonials/${testimonial.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'NOT_A_REAL_STATUS' });
    expect(res.status).toBe(400);
  });

  it('POST /reports rejects a non-UUID "auditId" with 400', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ auditId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });

  it('PATCH /settings/notifications rejects an unknown eventType with 400', async () => {
    const res = await request(app)
      .patch('/api/v1/settings/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ eventTypes: ['NOT_A_REAL_EVENT_TYPE'] });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/users/:id/status rejects a non-boolean "disabled" field with 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${user.id}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ disabled: 'yes-please' });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/organizations/:id/status rejects a non-boolean "suspended" field with 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/organizations/${org.id}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ suspended: 'yes-please' });
    expect(res.status).toBe(400);
  });

  it('PATCH /admin/express-fix/:id/status rejects an unknown status value with 400', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/express-fix/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ status: 'NOT_A_REAL_STATUS' });
    expect(res.status).toBe(400);
  });
});
