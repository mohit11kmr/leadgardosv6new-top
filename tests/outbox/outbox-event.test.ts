import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import { outboxService } from '../../apps/api/src/services/outboxService.js';

describe('Transactional Outbox Pattern', () => {
  let org: any;

  beforeEach(async () => {
    org = await db.organization.create({
      data: { name: 'Outbox Org', slug: `outbox-org-${Date.now()}-${Math.random()}` },
    });
  });

  it('persists domain events atomically in OutboxEvent table', async () => {
    const event = await outboxService.emitEvent(
      org.id,
      'AUDIT_COMPLETED',
      'AUDIT',
      'audit-id-123',
      { score: 95, websiteUrl: 'https://example.com' }
    );

    expect(event.id).toBeDefined();
    expect(event.eventType).toBe('AUDIT_COMPLETED');
    expect(event.status).toBe('PENDING');
    expect((event.payload as any).score).toBe(95);

    const dbEvent = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(dbEvent).toBeDefined();
    expect(dbEvent?.organizationId).toBe(org.id);
  });
});
