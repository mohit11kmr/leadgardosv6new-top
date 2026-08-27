import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Testimonial Wall & Moderation (LG-037)', () => {
  let user: any;
  let org: any;
  let token: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `testimony-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Testimony Org', slug: `testimony-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    token = createAccessToken(user.id, org.id);
  });

  it('creates, moderates, and lists approved testimonials on public API', async () => {
    // Create testimonial
    const createRes = await request(app)
      .post('/api/v1/testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        authorName: 'Alex Rivera',
        companyName: 'Apex Growth',
        role: 'Founder',
        content: 'LeadGuard increased our inbound lead conversion rate by 34%!',
        rating: 5,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.status).toBe('PENDING');

    const testimonialId = createRes.body.data.id;

    // Public API only shows APPROVED testimonials -> currently empty
    const publicEmptyRes = await request(app).get(`/api/v1/public/testimonials?organizationId=${org.id}`);
    expect(publicEmptyRes.status).toBe(200);
    expect(publicEmptyRes.body.data).toHaveLength(0);

    // Approve testimonial
    const approveRes = await request(app)
      .patch(`/api/v1/testimonials/${testimonialId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'APPROVED' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    // Public API now shows approved testimonial
    const publicRes = await request(app).get(`/api/v1/public/testimonials?organizationId=${org.id}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data).toHaveLength(1);
    expect(publicRes.body.data[0].authorName).toBe('Alex Rivera');
    expect(publicRes.body.data[0].rating).toBe(5);
  });
});
