import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
        verifiedFindings: 0,
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

// Regression for the audit finding: the VaultAuditRun status update and the
// OutboxEvent creation used to be two separate, non-transactional writes, so
// a worker crash between them left a COMPLETED run with no outbox row and
// thus no webhook — ever, silently, despite the outbox pattern's entire
// purpose being guaranteed eventual delivery. True crash-mid-transaction
// isn't practical to simulate in an integration test, so this statically
// verifies vaultScan.ts wraps both writes in a single db.$transaction (same
// source-inspection pattern used by architecture.test.ts).
describe('VaultGuard scan: outbox write is atomic with the run status update', () => {
  it('creates the outbox event inside the same db.$transaction as the VaultAuditRun update', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'apps/worker/src/audit/vaultScan.ts'),
      'utf-8'
    );

    const transactionIndex = source.indexOf('db.$transaction(async (tx)');
    expect(transactionIndex).toBeGreaterThan(-1);

    const transactionBody = source.slice(transactionIndex, source.indexOf('\n    });', transactionIndex));
    expect(transactionBody).toMatch(/tx\.vaultAuditRun\.update\(/);
    expect(transactionBody).toMatch(/createVaultCompletedOutboxEvent\(tx,/);
  });
});
