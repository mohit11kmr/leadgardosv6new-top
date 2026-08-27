import { db } from '@leadguard/database';

export class MonitoringRetentionCleaner {
  /**
   * Purges monitoring runs and findings older than retention days
   */
  async cleanupOldRuns(retentionDays = 30): Promise<{ deletedRuns: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);

    // Delete associated findings first (or cascade via DB)
    await db.monitoringFinding.deleteMany({
      where: { detectedAt: { lt: cutoff } },
    });

    const result = await db.monitoringRun.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return { deletedRuns: result.count };
  }
}

export const monitoringCleaner = new MonitoringRetentionCleaner();
