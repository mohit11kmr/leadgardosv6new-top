import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';

describe('Public API Security: SSRF Validation Gate', () => {
  let user: any;
  let org: any;
  let apiKey: string;
  let oldAllowFixtures: string | undefined;

  beforeEach(async () => {
    oldAllowFixtures = process.env.ALLOW_LOCAL_FIXTURES;
    delete process.env.ALLOW_LOCAL_FIXTURES;

    user = await db.user.create({
      data: { email: `ssrf-test-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'SSRF Test Org', slug: `ssrf-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const keyRes = await apiKeyService.createApiKey(org.id, user.id, 'Audit Key', [
      'AUDIT_READ',
      'AUDIT_RUN',
    ]);
    apiKey = keyRes.rawKey;
  });

  afterEach(() => {
    if (oldAllowFixtures !== undefined) {
      process.env.ALLOW_LOCAL_FIXTURES = oldAllowFixtures;
    }
  });

  it('rejects loopback and localhost URLs', async () => {
    const targets = ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://0.0.0.0'];
    for (const url of targets) {
      const res = await request(app)
        .post('/api/v1/public/audits')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ url });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    }
  });

  it('rejects cloud metadata endpoints', async () => {
    const targets = [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://instance-data.ec2.internal',
    ];
    for (const url of targets) {
      const res = await request(app)
        .post('/api/v1/public/audits')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ url });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    }
  });

  it('rejects private IPv4 networks (RFC 1918)', async () => {
    const targets = ['http://10.0.0.1', 'http://192.168.1.1', 'http://172.16.0.1'];
    for (const url of targets) {
      const res = await request(app)
        .post('/api/v1/public/audits')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ url });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    }
  });

  it('rejects credentials in URLs and unsupported schemes', async () => {
    const targets = [
      'https://admin:password@example.com',
      'ftp://example.com/file',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ];
    for (const url of targets) {
      const res = await request(app)
        .post('/api/v1/public/audits')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ url });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SSRF_BLOCKED');
    }
  });

  it('accepts safe public HTTPS URLs', async () => {
    const res = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.website.domain).toBe('example.com');
  });
});
