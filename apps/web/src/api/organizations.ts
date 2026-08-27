import { accessTokenKey, apiClient } from './client.js';

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface OrganizationListResponse {
  activeOrganizationId: string;
  organizations: Organization[];
}

export async function getOrganizations(): Promise<OrganizationListResponse> {
  return apiClient<OrganizationListResponse>('/organizations');
}

export async function createOrganization(input: { name: string; slug: string }): Promise<Organization> {
  return apiClient<Organization>('/organizations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function switchOrganization(organizationId: string): Promise<{ accessToken: string; organizationId: string }> {
  const res = await apiClient<{ accessToken: string; organizationId: string }>(`/organizations/${organizationId}/switch`, {
    method: 'POST',
  });
  localStorage.setItem(accessTokenKey, res.accessToken);
  window.dispatchEvent(new Event('leadguard-auth-changed'));
  return res;
}
