import type { Queue } from 'bullmq';

/**
 * Thin operations summary layer (Control Plane phase, Phase 9) — Bull Board
 * remains the operational queue UI (mounted at /admin/queues, unchanged
 * from the Revenue Foundation phase); this is only a lightweight,
 * dashboard-friendly job-count rollup across the same real queues, using
 * BullMQ's own getJobCounts(), not a second queue system.
 */
export interface QueueHealthSummary {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  paused: number;
}

export async function getOperationsSummary(queues: Record<string, Queue>): Promise<{ queues: QueueHealthSummary[]; asOf: string }> {
  const entries = await Promise.all(
    Object.entries(queues).map(async ([name, queue]) => {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
      return {
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
        paused: counts.paused ?? 0,
      };
    })
  );
  return { queues: entries, asOf: new Date().toISOString() };
}
