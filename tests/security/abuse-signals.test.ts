import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

// SSRF rejection is bypassed under ALLOW_LOCAL_FIXTURES=true (the suite's
// own convention, see packages/shared/src/url-security.ts), so — matching
// the established pattern in tests/security/webhook-ssrf.test.ts — this
// suite temporarily disables it to exercise genuine rejection.
let oldAllowFixtures: string | undefined;

beforeEach(() => {
  oldAllowFixtures = process.env.ALLOW_LOCAL_FIXTURES;
  delete process.env.ALLOW_LOCAL_FIXTURES;
});

afterEach(() => {
  if (oldAllowFixtures !== undefined) {
    process.env.ALLOW_LOCAL_FIXTURES = oldAllowFixtures;
  }
});

async function makeAuthedOrgOwner() {
  const user = await db.user.create({ data: { email: `ssrf_${Date.now()}_${Math.random()}@example.com`, passwordHash: 'hash' } });
  const org = await db.organization.create({ data: { name: `SSRF Org ${user.id}`, slug: `ssrf-org-${user.id}` } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
  const token = createAccessToken(user.id, org.id);
  return { user, org, token };
}

describe('Security signals — SSRF block recording', () => {
  it('records an SSRF_BLOCKED SecurityEvent when a webhook endpoint URL targets a private address', async () => {
    const { user, token } = await makeAuthedOrgOwner();

    const res = await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'http://127.0.0.1:9999/hook', events: ['*'] });

    expect(res.status).toBe(400);
    const event = await db.securityEvent.findFirst({ where: { userId: user.id, type: 'SSRF_BLOCKED' } });
    expect(event).toBeTruthy();
    expect((event?.metadata as any)?.context).toBe('webhook_endpoint');
  });

  it('records an SSRF_BLOCKED SecurityEvent when registering a website targets a private address', async () => {
    const { user, token } = await makeAuthedOrgOwner();

    const res = await request(app)
      .post('/api/v1/websites')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Internal Probe', url: 'http://169.254.169.254/latest/meta-data' });

    expect(res.status).toBe(400);
    const event = await db.securityEvent.findFirst({ where: { userId: user.id, type: 'SSRF_BLOCKED' } });
    expect(event).toBeTruthy();
    expect((event?.metadata as any)?.context).toBe('website_create');
  });

  it('never leaks the webhook signing secret in the SSRF_BLOCKED event metadata', async () => {
    const { user, token } = await makeAuthedOrgOwner();
    await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({ url: 'http://localhost:1/hook', events: ['*'] });

    const event = await db.securityEvent.findFirst({ where: { userId: user.id, type: 'SSRF_BLOCKED' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(event?.metadata ?? {})).not.toContain('whsec_');
  });
});
