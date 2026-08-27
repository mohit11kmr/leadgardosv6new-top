import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { entitlementService } from '../entitlementService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const prospectQueue = new Queue('agency-prospect', { connection });

export interface ProspectInputItem {
  url: string;
  businessName?: string;
  industry?: string;
  location?: string;
}

export interface ProspectSource {
  extract(): Promise<ProspectInputItem[]>;
}

export class ManualProspectSource implements ProspectSource {
  constructor(private items: ProspectInputItem[]) {}
  async extract(): Promise<ProspectInputItem[]> {
    return this.items;
  }
}

export class CsvProspectSource implements ProspectSource {
  constructor(private csvContent: string) {}
  async extract(): Promise<ProspectInputItem[]> {
    const lines = this.csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const headers = lines[0]!.toLowerCase().split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const urlIdx = headers.findIndex((h) => h === 'url' || h === 'website' || h === 'domain');
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'businessname' || h === 'company');
    const indIdx = headers.findIndex((h) => h === 'industry' || h === 'category');
    const locIdx = headers.findIndex((h) => h === 'location' || h === 'city' || h === 'country');

    const effectiveUrlIdx = urlIdx >= 0 ? urlIdx : 0;
    const items: ProspectInputItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i]!.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      const rawUrl = parts[effectiveUrlIdx];
      if (!rawUrl) continue;

      items.push({
        url: rawUrl,
        businessName: nameIdx >= 0 ? parts[nameIdx] : undefined,
        industry: indIdx >= 0 ? parts[indIdx] : undefined,
        location: locIdx >= 0 ? parts[locIdx] : undefined,
      });
    }

    return items;
  }
}

export function validateSafeUrl(rawUrl: string): { isValid: boolean; normalizedUrl?: string; domain?: string; error?: string } {
  try {
    let toParse = rawUrl.trim();
    if (!/^https?:\/\//i.test(toParse)) {
      toParse = `https://${toParse}`;
    }

    const parsed = new URL(toParse);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    const host = parsed.hostname.toLowerCase();

    // SSRF Protections
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      host.endsWith('.internal') ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return { isValid: false, error: 'Access to local/private network addresses is blocked' };
    }

    const normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '/' : parsed.pathname}`;
    return { isValid: true, normalizedUrl, domain: host };
  } catch (err) {
    return { isValid: false, error: 'Malformed URL format' };
  }
}

export class ProspectService {
  async createCampaign(
    organizationId: string,
    input: {
      name: string;
      clientWorkspaceId?: string;
      sourceType: 'MANUAL' | 'CSV';
      items?: ProspectInputItem[];
      csvContent?: string;
    }
  ) {
    // 1. Extract prospect items from source
    let source: ProspectSource;
    if (input.sourceType === 'CSV' && input.csvContent) {
      source = new CsvProspectSource(input.csvContent);
    } else {
      source = new ManualProspectSource(input.items || []);
    }

    const rawItems = await source.extract();
    if (rawItems.length === 0) {
      throw new Error('No candidate URLs provided in campaign');
    }

    // 2. Entitlement limit check (max 500 prospects per campaign on Agency tier)
    const entitlement = await entitlementService.canCreateProspectCampaign(organizationId, rawItems.length);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 3. Create Campaign record
    const campaign = await db.prospectCampaign.create({
      data: {
        organizationId,
        clientWorkspaceId: input.clientWorkspaceId || null,
        name: input.name,
        source: input.sourceType,
        targetCount: rawItems.length,
        status: 'DRAFT',
      },
    });

    // 4. Validate and ingest prospects
    const validProspects = [];
    for (const item of rawItems) {
      const val = validateSafeUrl(item.url);
      if (!val.isValid || !val.normalizedUrl || !val.domain) {
        continue;
      }

      validProspects.push({
        campaignId: campaign.id,
        organizationId,
        url: item.url,
        normalizedUrl: val.normalizedUrl,
        domain: val.domain,
        businessName: item.businessName || null,
        industry: item.industry || null,
        location: item.location || null,
        status: 'DISCOVERED',
        source: input.sourceType,
      });
    }

    if (validProspects.length > 0) {
      await db.prospect.createMany({
        data: validProspects,
      });
    }

    return db.prospectCampaign.update({
      where: { id: campaign.id },
      data: { targetCount: validProspects.length },
      include: {
        _count: { select: { prospects: true } },
      },
    });
  }

  async startCampaign(organizationId: string, campaignId: string) {
    const campaign = await db.prospectCampaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) throw new Error('Prospect campaign not found');

    if (campaign.status === 'RUNNING') {
      return { enqueued: false, message: 'Campaign is already running' };
    }

    await db.prospectCampaign.update({
      where: { id: campaignId },
      data: { status: 'QUEUED', startedAt: new Date() },
    });

    const job = await prospectQueue.add(
      'process-campaign',
      { campaignId, organizationId },
      { jobId: `camp_${campaignId}` }
    );

    return { enqueued: true, jobId: job.id, status: 'QUEUED' };
  }

  async pauseCampaign(organizationId: string, campaignId: string) {
    const campaign = await db.prospectCampaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) throw new Error('Prospect campaign not found');

    return db.prospectCampaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    });
  }

  async cancelCampaign(organizationId: string, campaignId: string) {
    const campaign = await db.prospectCampaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) throw new Error('Prospect campaign not found');

    return db.prospectCampaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    });
  }

  async listCampaigns(organizationId: string) {
    return db.prospectCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        clientWorkspace: { select: { id: true, name: true } },
        _count: { select: { prospects: true } },
      },
    });
  }

  async getCampaign(organizationId: string, campaignId: string) {
    return db.prospectCampaign.findFirst({
      where: { id: campaignId, organizationId },
      include: {
        clientWorkspace: true,
        prospects: {
          orderBy: { leadScore: 'asc' },
          take: 50,
        },
      },
    });
  }

  async getProspects(
    organizationId: string,
    campaignId: string,
    options: {
      status?: string;
      minScore?: number;
      maxScore?: number;
      cursor?: string;
      limit?: number;
    } = {}
  ) {
    const limit = Math.max(1, Math.min(100, options.limit || 25));

    const campaign = await db.prospectCampaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) throw new Error('Campaign not found');

    const where: any = {
      campaignId,
      organizationId,
      ...(options.status ? { status: options.status } : {}),
    };

    if (options.minScore !== undefined || options.maxScore !== undefined) {
      where.leadScore = {};
      if (options.minScore !== undefined) where.leadScore.gte = options.minScore;
      if (options.maxScore !== undefined) where.leadScore.lte = options.maxScore;
    }

    const prospects = await db.prospect.findMany({
      where,
      orderBy: [{ leadScore: 'asc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: {
        audit: { select: { id: true, status: true, progress: true } },
        pitches: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const hasNextPage = prospects.length > limit;
    const items = hasNextPage ? prospects.slice(0, limit) : prospects;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return { items, hasNextPage, nextCursor };
  }
}

export const prospectService = new ProspectService();
