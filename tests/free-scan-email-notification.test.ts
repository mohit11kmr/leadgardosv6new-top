process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL = 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL = 'redis://localhost:16380';
process.env.JWT_SECRET = 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);
process.env.APP_URL = 'http://localhost:5173';
process.env.API_URL = 'http://localhost:4000';

import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../apps/api/src/server.js';
import { processAudit } from '../apps/worker/src/audit.js';
import { emailProvider } from '../apps/worker/src/monitoring/notifications/emailProvider.js';
import { systemGuestOrganizationService } from '../apps/api/src/services/systemGuestOrganizationService.js';
import { redisClient } from '../apps/api/src/middleware/rateLimiters.js';

// The guest free-scan endpoint is rate-limited (3/hour/IP) — these two HTTP
// round-trip tests stay within that budget, but the counter is keyed in
// Redis (not reset by the DB truncation in global-setup), so a prior test
// run within the same hour would otherwise leave this suite starting from
// an already-exhausted quota. Clear it explicitly so this test is
// self-contained regardless of run history.
describe('Free scan email capture (HTTP layer)', () => {
  beforeAll(async () => {
    const keys = await redisClient.keys('ratelimit:guest_scan:*');
    if (keys.length > 0) await redisClient.del(...keys);
  });

  it('POST /public/free-scan with an email stores it on the created Audit', async () => {
    const res = await request(app)
      .post('/api/v1/public/free-scan')
      .send({ url: `https://email-capture-${Date.now()}.example`, email: 'visitor@example.com' });

    expect(res.status).toBe(201);
    const audit = await db.audit.findUnique({ where: { id: res.body.data.scanId } });
    expect(audit?.guestEmail).toBe('visitor@example.com');
  });

  it('rejects a malformed email with 400', async () => {
    const res = await request(app)
      .post('/api/v1/public/free-scan')
      .send({ url: `https://email-capture-bad-${Date.now()}.example`, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('Free scan "scan ready" email notification (worker layer)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails the visitor their report link once the scan completes, when an email was captured', async () => {
    const guestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();
    const website = await db.website.create({
      data: {
        organizationId: guestOrgId,
        name: 'Email Notify Site',
        url: `https://email-notify-${Date.now()}.example`,
        normalizedUrl: `https://email-notify-${Date.now()}.example`,
        domain: `email-notify-${Date.now()}.example`,
      },
    });
    const audit = await db.audit.create({
      data: { organizationId: guestOrgId, websiteId: website.id, status: 'QUEUED', guestEmail: 'notify-me@example.com' },
    });

    const sendEmailSpy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue({ messageId: 'test', success: true });

    await processAudit(audit.id, new AbortController().signal);

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const call = sendEmailSpy.mock.calls[0]?.[0];
    expect(call?.to).toBe('notify-me@example.com');
    expect(call?.body).toContain(`/scan/${audit.id}`);
  }, 30_000);

  it('does not attempt to send an email when no email was captured', async () => {
    const guestOrgId = await systemGuestOrganizationService.getOrCreateSystemGuestOrganization();
    const website = await db.website.create({
      data: {
        organizationId: guestOrgId,
        name: 'Email Notify None Site',
        url: `https://email-notify-none-${Date.now()}.example`,
        normalizedUrl: `https://email-notify-none-${Date.now()}.example`,
        domain: `email-notify-none-${Date.now()}.example`,
      },
    });
    const audit = await db.audit.create({
      data: { organizationId: guestOrgId, websiteId: website.id, status: 'QUEUED' },
    });

    const sendEmailSpy = vi.spyOn(emailProvider, 'sendEmail').mockResolvedValue({ messageId: 'test', success: true });

    await processAudit(audit.id, new AbortController().signal);

    expect(sendEmailSpy).not.toHaveBeenCalled();
  }, 30_000);
});
