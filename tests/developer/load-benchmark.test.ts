import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';
import { generateWebhookSignature, verifyWebhookSignature } from '../../apps/worker/src/webhook/webhookWorker.js';

function calculatePercentiles(latencies: number[]) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  return { p50, p95, p99 };
}

describe('Load & Latency Benchmark Matrix (Requirement 29)', () => {
  let user: any;
  let org: any;
  let website: any;
  let apiKey: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `bench-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Benchmark Org', slug: `bench-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });

    const keyRes = await apiKeyService.createApiKey(org.id, user.id, 'Bench Key', [
      'AUDIT_READ',
      'AUDIT_RUN',
      'MONITORING_READ',
      'MONITORING_RUN',
      'REPORT_READ',
    ]);
    apiKey = keyRes.rawKey;

    website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Benchmark Site',
        url: 'https://bench-test.com',
        domain: 'bench-test.com',
        normalizedUrl: 'https://bench-test.com',
      },
    });

    for (let i = 0; i < 10; i++) {
      await db.audit.create({
        data: {
          organizationId: org.id,
          websiteId: website.id,
          status: 'COMPLETED',
        },
      });
    }
  });

  it('measures latency for 50 public API reads with p50, p95, p99 metrics', async () => {
    const latencies: number[] = [];

    for (let i = 0; i < 50; i++) {
      const start = Date.now();
      const res = await request(app)
        .get('/api/v1/public/audits?limit=5')
        .set('Authorization', `Bearer ${apiKey}`);
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      latencies.push(duration);
    }

    const { p50, p95, p99 } = calculatePercentiles(latencies);
    expect(p50).toBeLessThan(150);
    expect(p95).toBeLessThan(500);
    expect(p99).toBeLessThan(1000);
  }, 30000);

  it('measures latency for 100 HMAC-SHA256 webhook signature generations & verifications', () => {
    const latencies: number[] = [];
    const secret = 'whsec_test_secret_key_12345';
    const payload = JSON.stringify({ event: 'AUDIT_COMPLETED', timestamp: Date.now(), data: { score: 92 } });
    const timestamp = Math.floor(Date.now() / 1000);

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const sig = generateWebhookSignature(payload, secret, timestamp);
      const valid = verifyWebhookSignature(payload, secret, timestamp, sig);
      const duration = performance.now() - start;

      expect(valid).toBe(true);
      latencies.push(duration);
    }

    const { p50, p95, p99 } = calculatePercentiles(latencies);
    expect(p50).toBeLessThan(2); // sub-2ms per crypto operation
    expect(p95).toBeLessThan(5);
  });
});
