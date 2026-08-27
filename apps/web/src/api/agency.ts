import { apiClient } from './client.js';

export interface AgencyMetrics {
  clients: number;
  websites: number;
  audits: number;
  campaigns: number;
  prospects: number;
  qualifiedProspects: number;
  widgets: number;
  competitors: number;
  criticalFindings: number;
  estimatedPipelineOpportunityInr: number;
}

export interface ClientWorkspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'ONBOARDING';
  contactName?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  branding?: {
    logoUrl?: string;
    companyName?: string;
    website?: string;
    supportEmail?: string;
    primaryColor?: string;
    secondaryColor?: string;
    footer?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  websites?: Array<{ id: string; name: string; url: string; domain: string }>;
  _count?: {
    websites: number;
    prospectCampaigns: number;
    widgets: number;
  };
}

export interface ProspectCampaign {
  id: string;
  organizationId: string;
  name: string;
  source: 'MANUAL' | 'CSV' | 'SEARCH';
  status: 'DRAFT' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  targetCount: number;
  processedCount: number;
  qualifiedCount: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  clientWorkspace?: { id: string; name: string } | null;
  _count?: { prospects: number };
}

export interface Prospect {
  id: string;
  campaignId: string;
  url: string;
  domain: string;
  businessName?: string | null;
  industry?: string | null;
  location?: string | null;
  status: 'DISCOVERED' | 'VALIDATED' | 'AUDITED' | 'QUALIFIED' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED';
  leadScore?: number | null;
  criticalFindings: number;
  highFindings: number;
  potentialOpportunity?: string | null;
  createdAt: string;
  pitches?: Pitch[];
}

export interface Pitch {
  id: string;
  prospectId: string;
  provider: string;
  model: string;
  promptVersion: string;
  language: string;
  tone: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT';
  subject: string;
  opening: string;
  problem: string;
  businessImpact: string;
  recommendation: string;
  callToAction: string;
  content: string;
  tokensUsed?: number | null;
  createdAt: string;
}

export interface Widget {
  id: string;
  organizationId: string;
  clientWorkspaceId?: string | null;
  name: string;
  allowedOrigins: string[];
  theme: 'LIGHT' | 'DARK' | 'AUTO';
  displayMode: 'EMBED' | 'MODAL' | 'FLOATING_BUTTON';
  enabled: boolean;
  rawToken?: string;
  createdAt: string;
  clientWorkspace?: { id: string; name: string } | null;
}

export interface CompetitorComparison {
  id: string;
  organizationId: string;
  name: string;
  targetUrl: string;
  competitorUrls: string[];
  status: 'DRAFT' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  comparisonData?: {
    target: { url: string; score: number; criticalCount: number; hasWhatsApp: boolean; hasCta: boolean; responseTimeMs: number };
    competitors: Array<{ url: string; score: number; criticalCount: number; hasWhatsApp: boolean; hasCta: boolean; responseTimeMs: number }>;
  } | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  opportunities?: string[] | null;
  lastRunAt?: string | null;
  createdAt: string;
}

export const agencyApi = {
  getOverview: async () => {
    const res = await apiClient<{ metrics: AgencyMetrics }>('/agency/overview');
    return res.metrics;
  },

  getClients: async (params?: { status?: string; search?: string; cursor?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.limit) query.append('limit', String(params.limit));

    const qs = query.toString();
    return apiClient<{ items: ClientWorkspace[]; hasNextPage: boolean; nextCursor: string | null }>(
      `/agency/clients${qs ? `?${qs}` : ''}`
    );
  },

  getClient: async (id: string) => {
    return apiClient<ClientWorkspace>(`/agency/clients/${id}`);
  },

  createClient: async (input: { name: string; contactName?: string; contactEmail?: string; notes?: string; branding?: Record<string, unknown> }) => {
    return apiClient<ClientWorkspace>('/agency/clients', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateClient: async (id: string, input: Partial<ClientWorkspace>) => {
    return apiClient<ClientWorkspace>(`/agency/clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  archiveClient: async (id: string) => {
    return apiClient<{ message: string }>(`/agency/clients/${id}`, {
      method: 'DELETE',
    });
  },

  assignWebsite: async (clientId: string, websiteId: string) => {
    return apiClient<unknown>(`/agency/clients/${clientId}/websites`, {
      method: 'POST',
      body: JSON.stringify({ websiteId }),
    });
  },

  removeWebsite: async (clientId: string, websiteId: string) => {
    return apiClient<unknown>(`/agency/clients/${clientId}/websites/${websiteId}`, {
      method: 'DELETE',
    });
  },

  getCampaigns: async () => {
    return apiClient<ProspectCampaign[]>('/agency/prospect-campaigns');
  },

  getCampaign: async (id: string) => {
    return apiClient<ProspectCampaign & { prospects: Prospect[] }>(`/agency/prospect-campaigns/${id}`);
  },

  createCampaign: async (input: {
    name: string;
    clientWorkspaceId?: string;
    sourceType: 'MANUAL' | 'CSV';
    items?: Array<{ url: string; businessName?: string; industry?: string; location?: string }>;
    csvContent?: string;
  }) => {
    return apiClient<ProspectCampaign>('/agency/prospect-campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  startCampaign: async (id: string) => {
    return apiClient<{ enqueued: boolean; status: string }>(`/agency/prospect-campaigns/${id}/start`, {
      method: 'POST',
    });
  },

  pauseCampaign: async (id: string) => {
    return apiClient<unknown>(`/agency/prospect-campaigns/${id}/pause`, {
      method: 'POST',
    });
  },

  cancelCampaign: async (id: string) => {
    return apiClient<unknown>(`/agency/prospect-campaigns/${id}/cancel`, {
      method: 'POST',
    });
  },

  getCampaignProspects: async (
    id: string,
    params?: { status?: string; minScore?: number; maxScore?: number; cursor?: string; limit?: number }
  ) => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.minScore !== undefined) query.append('minScore', String(params.minScore));
    if (params?.maxScore !== undefined) query.append('maxScore', String(params.maxScore));
    if (params?.cursor) query.append('cursor', params.cursor);
    if (params?.limit) query.append('limit', String(params.limit));

    const qs = query.toString();
    return apiClient<{ items: Prospect[]; hasNextPage: boolean; nextCursor: string | null }>(
      `/agency/prospect-campaigns/${id}/prospects${qs ? `?${qs}` : ''}`
    );
  },

  generatePitch: async (
    prospectId: string,
    options?: { tone?: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT'; language?: string }
  ) => {
    return apiClient<Pitch>(`/agency/prospects/${prospectId}/pitches`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  getPitches: async (prospectId: string) => {
    return apiClient<Pitch[]>(`/agency/prospects/${prospectId}/pitches`);
  },

  getWidgets: async () => {
    return apiClient<Widget[]>('/agency/widgets');
  },

  createWidget: async (input: {
    name: string;
    clientWorkspaceId?: string;
    allowedOrigins: string[];
    theme?: 'LIGHT' | 'DARK' | 'AUTO';
    displayMode?: 'EMBED' | 'MODAL' | 'FLOATING_BUTTON';
  }) => {
    return apiClient<Widget>('/agency/widgets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateWidget: async (id: string, input: Partial<Widget>) => {
    return apiClient<Widget>(`/agency/widgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteWidget: async (id: string) => {
    return apiClient<{ message: string }>(`/agency/widgets/${id}`, {
      method: 'DELETE',
    });
  },

  getCompetitors: async () => {
    return apiClient<CompetitorComparison[]>('/agency/competitors');
  },

  getCompetitor: async (id: string) => {
    return apiClient<CompetitorComparison>(`/agency/competitors/${id}`);
  },

  createCompetitor: async (input: {
    name: string;
    targetUrl: string;
    competitorUrls: string[];
    clientWorkspaceId?: string;
  }) => {
    return apiClient<CompetitorComparison>('/agency/competitors', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  runCompetitor: async (id: string) => {
    return apiClient<{ enqueued: boolean; status: string }>(`/agency/competitors/${id}/run`, {
      method: 'POST',
    });
  },

  deleteCompetitor: async (id: string) => {
    return apiClient<{ message: string }>(`/agency/competitors/${id}`, {
      method: 'DELETE',
    });
  },
};
