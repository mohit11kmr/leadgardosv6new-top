import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';

describe('Public API Idempotency (Requirement 12, 13)', () => {
  let user: any;
  let org1: any;
  let org2: any;
  let apiKey1: string;
  let apiKey2: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `idemp-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org1 = await db.organization.create({
      data: { name: 'Org 1', slug: `org1-${Date.now()}-${Math.random()}` },
    });
    org2 = await db.organization.create({
      data: { name: 'Org 2', slug: `org2-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org1.id, userId: user.id, role: 'OWNER' },
    });
    await db.organizationMember.create({
      data: { organizationId: org2.id, userId: user.id, role: 'OWNER' },
    });

    const k1 = await apiKeyService.createApiKey(org1.id, user.id, 'Key 1', [
      'AUDIT_READ',
      'AUDIT_RUN',
      'MONITORING_READ',
      'MONITORING_RUN',
    ]);
    apiKey1 = k1.rawKey;

    const k2 = await apiKeyService.createApiKey(org2.id, user.id, 'Key 2', [
      'AUDIT_READ',
      'AUDIT_RUN',
    ]);
    apiKey2 = k2.rawKey;
  });

  it('prevents duplicate audit creation when Idempotency-Key header is supplied', async () => {
    const key = `idem-audit-${Date.now()}`;

    // First request
    const res1 = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey1}`)
      .set('Idempotency-Key', key)
      .send({ url: 'https://idempotent-target.com' });

    expect(res1.status).toBe(201);
    const auditId1 = res1.body.data.id;

    // Second request with exact same Idempotency-Key
    const res2 = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey1}`)
      .set('Idempotency-Key', key)
      .send({ url: 'https://idempotent-target.com' });

    expect(res2.status).toBe(201);
    const auditId2 = res2.body.data.id;

    // Must return the exact same audit ID without creating duplicates
    expect(auditId2).toBe(auditId1);

    const totalAudits = await db.audit.count({
      where: { organizationId: org1.id, idempotencyKey: key },
    });
    expect(totalAudits).toBe(1);
  });

  it('isolates idempotency keys between different organizations', async () => {
    const key = `shared-idem-key-${Date.now()}`;

    const res1 = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey1}`)
      .set('Idempotency-Key', key)
      .send({ url: 'https://org1-target.com' });

    const res2 = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey2}`)
      .set('Idempotency-Key', key)
      .send({ url: 'https://org2-target.com' });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.id).not.toBe(res2.body.data.id);
  });
});
