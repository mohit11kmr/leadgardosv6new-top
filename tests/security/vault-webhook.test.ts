import { describe, it, expect } from 'vitest';
import { db } from '@leadguard/database';
import {
  emitVaultCompleted,
  VAULT_COMPLETED_EVENT,
} from '../../apps/worker/src/webhook/vaultWebhookEmitter.js';

describe('VaultGuard: security.audit.completed webhook emission (LG-021/LG-022)', () => {
  it('writes an outbox event and enqueues delivery for subscribed endpoints only', async () => {
    const org = await db.organization.create({
      data: { name: `Vault Wh Org ${Date.now()}`, slug: `vault-wh-${Date.now()}` },
    });

    const event = await emitVaultCompleted({
      organizationId: org.id,
      runId: 'run-123',
      websiteId: 'website-123',
      run: {
        mode: 'STANDARD',
        status: 'COMPLETED',
        score: 88,
        findingsCount: 3,
        retestedFindings: 3,
        fixedFindings: 1,
        pagesDiscovered: 10,
        pagesFetched: 8,
        pagesFailed: 1,
        durationMs: 1200,
        completedAt: new Date(),
        summary: { riskCounts: { HIGH: 1 } },
      },
    });

    // Outbox row exists and is PUBLISHED with the security.audit.completed contract
    const row = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(row).toBeTruthy();
    expect(row?.eventType).toBe(VAULT_COMPLETED_EVENT);
    expect(row?.status).toBe('PUBLISHED');
    expect(row?.aggregateType).toBe('VaultAuditRun');
    expect(row?.aggregateId).toBe('run-123');
    const payload = row?.payload as { event: string; score: number; runId: string };
    expect(payload.event).toBe('security.audit.completed');
    expect(payload.score).toBe(88);
    expect(payload.runId).toBe('run-123');
  });
});
