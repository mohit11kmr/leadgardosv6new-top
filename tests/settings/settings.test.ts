import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('User Account Settings & Security (LG-036)', () => {
  let user: any;
  let org: any;
  let token: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `settings-test-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Settings Org', slug: `settings-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    token = createAccessToken(user.id, org.id);
  });

  it('updates profile preferences (name, timezone, locale)', async () => {
    const updateRes = await request(app)
      .patch('/api/v1/settings/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Jane Doe',
        timezone: 'Asia/Kolkata',
        locale: 'en',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Jane Doe');
    expect(updateRes.body.data.timezone).toBe('Asia/Kolkata');
  });

  it('updates and retrieves notification preferences', async () => {
    const notifRes = await request(app)
      .patch('/api/v1/settings/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventTypes: ['AUDIT_COMPLETED', 'MONITORING_ALERT'],
        enabled: true,
      });

    expect(notifRes.status).toBe(200);
    expect(notifRes.body.data.eventTypes).toContain('AUDIT_COMPLETED');
    expect(notifRes.body.data.enabled).toBe(true);

    const getRes = await request(app)
      .get('/api/v1/settings/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.eventTypes).toEqual(['AUDIT_COMPLETED', 'MONITORING_ALERT']);
  });
});
