import { db } from '@leadguard/database';

export class RetentionService {
  /**
   * Purges raw ApiUsage request telemetry older than retentionDays (default 90 days)
   */
  async purgeOldApiUsage(retentionDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await db.apiUsage.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    return result.count;
  }

  /**
   * Purges historical WebhookDelivery logs older than retentionDays (default 60 days)
   */
  async purgeOldWebhookDeliveries(retentionDays = 60): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await db.webhookDelivery.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  /**
   * Purges processed OutboxEvent records older than retentionDays (default 30 days)
   */
  async purgeProcessedOutboxEvents(retentionDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await db.outboxEvent.deleteMany({
      where: {
        processedAt: { not: null, lt: cutoff },
      },
    });
    return result.count;
  }
}

export const retentionService = new RetentionService();
