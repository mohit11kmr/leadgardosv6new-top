import { Redis } from 'ioredis';
import { db } from '@leadguard/database';
import { config } from '@leadguard/config';

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const CACHE_KEY = 'public:platform-stats';
const CACHE_TTL_SECONDS = 300;

export interface PlatformStats {
  totalAuditsCompleted: number;
  totalIssuesFound: number;
  websitesMonitored: number;
}

/**
 * Real, live-computed platform-wide counts for public social-proof display
 * (landing page). Every number here is a genuine aggregate query — no
 * placeholder or invented figure — per the no-fake-data policy. Cached
 * briefly since this is a public, potentially high-traffic, unauthenticated
 * endpoint and the underlying counts don't need to be real-time-accurate.
 */
export class PlatformStatsService {
  async getStats(): Promise<PlatformStats> {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {
      // Redis unavailable — fall through to a live DB read.
    }

    const [totalAuditsCompleted, totalIssuesFound, websitesMonitored] = await Promise.all([
      db.audit.count({ where: { status: 'COMPLETED' } }),
      db.auditFinding.count(),
      db.monitoringConfig.count({ where: { enabled: true, archivedAt: null } }),
    ]);

    const stats: PlatformStats = { totalAuditsCompleted, totalIssuesFound, websitesMonitored };

    try {
      await redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Ignore cache write failures — the live numbers above are still returned.
    }

    return stats;
  }
}

export const platformStatsService = new PlatformStatsService();
