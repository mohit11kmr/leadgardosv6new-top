import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('VaultGuard Security Audit API (§5b, LG-038)', () => {
  let orgId: string;
  let websiteId: string;
  let ownerToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    const org = await db.organization.create({
      data: { name: `Vault Org ${Date.now()}`, slug: `vault-org-${Date.now()}` },
    });
    orgId = org.id;

    // Grant PRO plan so API access entitlement is satisfied.
    const proPlan = await db.plan.upsert({
      where: { code: 'PRO' },
      create: {
        code: 'PRO',
        name: 'Pro',
        priceInPaise: 499900,
        currency: 'INR',
        entitlements: {
          auditsPerMonth: 100,
          websites: 5,
          monitoring: true,
          apiAccess: true,
          whiteLabel: false,
          reports: 50,
          prospectLimit: 100,
        },
      },
      update: {},
    });
    await db.subscription.create({
      data: { organizationId: org.id, planId: proPlan.id, status: 'ACTIVE' },
    });

    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Vault Target',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        domain: 'example.com',
      },
    });
    websiteId = website.id;

    const owner = await db.user.create({
      data: { email: `vault_owner_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: owner.id, role: 'OWNER' },
    });
    ownerToken = createAccessToken(owner.id, org.id);

    const viewer = await db.user.create({
      data: { email: `vault_viewer_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: viewer.id, role: 'VIEWER' },
    });
    viewerToken = createAccessToken(viewer.id, org.id);
  });

  it('triggers, lists, and fetches security-audit runs; enforces VIEWER cannot run (RBAC)', async () => {
    // Viewer cannot run (needs SECURITY_AUDIT_RUN) -> 403 FORBIDDEN
    const viewerRun = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ mode: 'STANDARD' });
    expect(viewerRun.status).toBe(403);
    expect(viewerRun.body.error.code).toBe('FORBIDDEN');

    // Owner triggers STANDARD run
    const start = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'STANDARD' });
    expect(start.status).toBe(202);
    const runId = start.body.data.id;
    expect(runId).toBeTruthy();
    expect(start.body.data.status).toBe('QUEUED');
    expect(start.body.data.mode).toBe('STANDARD');

    // Idempotency: same key returns existing run with 200
    const idemKey = `vault-idem-${Date.now()}`;
    const s1 = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'STANDARD', idempotencyKey: idemKey });
    expect(s1.status).toBe(202);
    const s2 = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ mode: 'STANDARD', idempotencyKey: idemKey });
    expect(s2.status).toBe(200);
    expect(s2.body.meta.idempotent).toBe(true);
    expect(s2.body.data.id).toBe(s1.body.data.id);

    // List runs for the website
    const list = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    // Fetch a single run
    const getRun = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit/${runId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(getRun.status).toBe(200);
    expect(getRun.body.data.id).toBe(runId);

    // List findings (may be empty without a running worker, but pagination shape is exercised)
    const findings = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit/${runId}/findings`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(findings.status).toBe(200);
    expect(findings.body).toHaveProperty('meta.total');

    // Trigger a RETEST from the original run
    const retest = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit/${runId}/retest`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(retest.status).toBe(202);
    expect(retest.body.data.mode).toBe('RETEST');

    // Fetch evidence for a run (404 when no finding yet)
    const evidence = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit/${runId}/findings/00000000-0000-0000-0000-000000000000/evidence`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(evidence.status).toBe(404);
  });

  it('enforces cross-tenant isolation for vault runs', async () => {
    const otherOrg = await db.organization.create({
      data: { name: `Vault Other ${Date.now()}`, slug: `vault-other-${Date.now()}` },
    });
    const otherUser = await db.user.create({
      data: { email: `vault_other_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: otherOrg.id, userId: otherUser.id, role: 'OWNER' },
    });
    const otherToken = createAccessToken(otherUser.id, otherOrg.id);

    const crossTrigger = await request(app)
      .post(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ mode: 'STANDARD' });
    expect(crossTrigger.status).toBe(404);

    const crossList = await request(app)
      .get(`/api/v1/websites/${websiteId}/security-audit`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(crossList.status).toBe(404);
  });
});
