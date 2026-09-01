import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { db } from '@leadguard/database';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('POST /tools/whatsapp-link-debugger', () => {
  let token: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `wa-debug-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    const org = await db.organization.create({
      data: { name: 'WA Debug Org', slug: `wa-debug-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    token = createAccessToken(user.id, org.id);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/tools/whatsapp-link-debugger').send({ phone: '919876543210' });
    expect(res.status).toBe(401);
  });

  it('returns a valid link + no issues for a clean number', async () => {
    const res = await request(app)
      .post('/api/v1/tools/whatsapp-link-debugger')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919876543210', message: 'Hi there' });

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(true);
    expect(res.body.data.waLink).toContain('wa.me/919876543210');
  });

  it('flags a malformed number and returns 200 with issues (not a 500)', async () => {
    const res = await request(app)
      .post('/api/v1/tools/whatsapp-link-debugger')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '091987654321' });

    expect(res.status).toBe(200);
    expect(res.body.data.isValid).toBe(false);
    expect(res.body.data.issues.length).toBeGreaterThan(0);
  });

  it('rejects a missing phone field with 400', async () => {
    const res = await request(app)
      .post('/api/v1/tools/whatsapp-link-debugger')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'no phone here' });
    expect(res.status).toBe(400);
  });
});
