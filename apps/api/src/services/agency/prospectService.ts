import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { validateExternalUrl, normalizeUrl } from '@leadguard/shared';
import { entitlementService } from '../entitlementService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const prospectQueue = new Queue('agency-prospect', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
    removeOnComplete: true,
  },
});

export const MAX_PROSPECT_IMPORT_ROWS = 500;
export const MAX_PROSPECT_IMPORT_BYTES = 10 * 1024 * 1024; // 10MB

export interface ProspectInputItem {
  url: string;
  businessName?: string;
  industry?: string;
  location?: string;
}

export interface ProspectSource {
  extract(): Promise<ProspectInputItem[]>;
}

export interface StorageDriver {
  saveStagedFile(filename: string, content: string | Buffer): Promise<string>;
  readStagedFile(filePath: string): Promise<string>;
}

export class LocalStorageDriver implements StorageDriver {
  async saveStagedFile(filename: string, content: string | Buffer): Promise<string> {
    return `staged://${filename}`;
  }
  async readStagedFile(filePath: string): Promise<string> {
    return '';
  }
}

export class ManualProspectSource implements ProspectSource {
  constructor(private items: ProspectInputItem[]) {}
  async extract(): Promise<ProspectInputItem[]> {
    if (this.items.length > MAX_PROSPECT_IMPORT_ROWS) {
      const err = new Error(`Manual import exceeds maximum allowed limit of ${MAX_PROSPECT_IMPORT_ROWS} prospects`);
      (err as unknown as { code: string }).code = 'IMPORT_ROW_LIMIT_EXCEEDED';
      throw err;
    }
    return this.items;
  }
}

export function parseRfc4180Csv(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, '');
  if (Buffer.byteLength(cleanText, 'utf8') > MAX_PROSPECT_IMPORT_BYTES) {
    const err = new Error('CSV file exceeds maximum allowed size of 10MB');
    (err as unknown as { code: string }).code = 'IMPORT_BYTE_LIMIT_EXCEEDED';
    throw err;
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;

  while (i < cleanText.length) {
    const char = cleanText[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i += 1;
          continue;
        }
      } else {
        currentField += char;
        i += 1;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i += 1;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i += 1;
        continue;
      } else if (char === '\r') {
        if (i + 1 < cleanText.length && cleanText[i + 1] === '\n') {
          i += 1;
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i += 1;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i += 1;
        continue;
      } else {
        currentField += char;
        i += 1;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export class CsvProspectSource implements ProspectSource {
  constructor(private csvContent: string) {}

  async extract(): Promise<ProspectInputItem[]> {
    const rows = parseRfc4180Csv(this.csvContent);
    if (rows.length === 0) return [];

    const headers = rows[0]!.map((h) => h.toLowerCase());
    const urlIdx = headers.findIndex((h) => h === 'url' || h === 'website' || h === 'domain' || h === 'link');
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'businessname' || h === 'company' || h === 'business');
    const indIdx = headers.findIndex((h) => h === 'industry' || h === 'category' || h === 'niche');
    const locIdx = headers.findIndex((h) => h === 'location' || h === 'city' || h === 'address' || h === 'country');

    const effectiveUrlIdx = urlIdx >= 0 ? urlIdx : 0;
    const dataRows = rows.slice(1);

    if (dataRows.length > MAX_PROSPECT_IMPORT_ROWS) {
      const err = new Error(`CSV contains ${dataRows.length} rows which exceeds the maximum limit of ${MAX_PROSPECT_IMPORT_ROWS}`);
      (err as unknown as { code: string }).code = 'IMPORT_ROW_LIMIT_EXCEEDED';
      throw err;
    }

    const items: ProspectInputItem[] = [];
    for (const row of dataRows) {
      const rawUrl = row[effectiveUrlIdx]?.trim();
      if (!rawUrl) continue;

      items.push({
        url: rawUrl,
        businessName: (nameIdx >= 0 && row[nameIdx]?.trim()) || undefined,
        industry: (indIdx >= 0 && row[indIdx]?.trim()) || undefined,
        location: (locIdx >= 0 && row[locIdx]?.trim()) || undefined,
      });
    }

    return items;
  }
}

export async function validateSafeProspectUrl(rawUrl: string): Promise<{
  isValid: boolean;
  normalizedUrl?: string;
  domain?: string;
  error?: string;
}> {
  try {
    let toParse = rawUrl.trim();
    if (!/^https?:\/\//i.test(toParse)) {
      toParse = `https://${toParse}`;
    }

    const validatedUrl = await validateExternalUrl(toParse);
    const normalized = normalizeUrl(validatedUrl.toString());
    const domain = validatedUrl.hostname.toLowerCase();

    return {
      isValid: true,
      normalizedUrl: normalized,
      domain,
    };
  } catch (err: any) {
    return {
      isValid: false,
      error: err.message || 'Invalid or prohibited URL',
    };
  }
}

export { validateSafeProspectUrl as validateSafeUrl };

export class ProspectService {
  async createCampaign(
    organizationId: string,
    input: {
      name: string;
      clientWorkspaceId?: string;
      sourceType: 'MANUAL' | 'CSV';
      items?: ProspectInputItem[];
      csvContent?: string;
      qualificationCriteria?: {
        maxLeadScore?: number;
        minCriticalFindings?: number;
        minHighFindings?: number;
      };
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

    // 2. Entitlement limit check
    const entitlement = await entitlementService.canCreateProspectCampaign(organizationId, rawItems.length);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 3. Create Campaign record in DRAFT
    const campaign = await db.prospectCampaign.create({
      data: {
        organizationId,
        clientWorkspaceId: input.clientWorkspaceId || null,
        name: input.name,
        source: input.sourceType,
        targetCount: rawItems.length,
        status: 'DRAFT',
        qualificationCriteria: (input.qualificationCriteria as object) || null,
      },
    });

    // 4. Validate candidates and deduplicate within campaign
    const seenUrls = new Set<string>();
    const validProspects = [];

    for (const item of rawItems) {
      const val = await validateSafeProspectUrl(item.url);
      if (!val.isValid || !val.normalizedUrl || !val.domain) {
        continue;
      }

      if (seenUrls.has(val.normalizedUrl)) {
        continue; // Deduplicate duplicate candidate in same campaign
      }
      seenUrls.add(val.normalizedUrl);

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
        skipDuplicates: true,
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

    if (campaign.status === 'RUNNING' || campaign.status === 'QUEUED') {
      return { enqueued: false, message: 'Campaign is already queued or running' };
    }

    // Atomic Distributed Lock to prevent concurrent job enqueue races
    const lockKey = `camp:start:lock:${campaignId}`;
    const acquired = await connection.set(lockKey, '1', 'PX', 5000, 'NX');
    if (!acquired) {
      return { enqueued: false, message: 'Campaign start already in progress' };
    }

    try {
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
    } finally {
      await connection.del(lockKey);
    }
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

  async listCampaigns(
    organizationId: string,
    options: { cursor?: string; limit?: number } = {}
  ) {
    const limit = Math.max(1, Math.min(100, options.limit || 50));
    const campaigns = await db.prospectCampaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: {
        clientWorkspace: { select: { id: true, name: true } },
        _count: { select: { prospects: true } },
      },
    });

    const hasNextPage = campaigns.length > limit;
    const items = hasNextPage ? campaigns.slice(0, limit) : campaigns;
    const nextCursor = hasNextPage ? items[items.length - 1]?.id : null;

    return { items, hasNextPage, nextCursor };
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
