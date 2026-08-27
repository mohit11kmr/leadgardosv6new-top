import { apiClient } from './client.js';
import type { Audit } from './audits.js';

export interface Website {
  id: string;
  name: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  status: string;
  createdAt: string;
  audits?: Audit[];
}

export async function getWebsites(): Promise<Website[]> {
  return apiClient<Website[]>('/websites');
}

export async function getWebsite(id: string): Promise<Website> {
  return apiClient<Website>(`/websites/${id}`);
}

export async function createWebsite(input: { name: string; url: string }): Promise<Website> {
  return apiClient<Website>('/websites', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWebsite(id: string, input: { name?: string; url?: string }): Promise<Website> {
  return apiClient<Website>(`/websites/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function archiveWebsite(id: string): Promise<void> {
  return apiClient<void>(`/websites/${id}`, {
    method: 'DELETE',
  });
}
