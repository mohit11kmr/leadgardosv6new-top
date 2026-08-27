import { accessTokenKey, apiClient, refreshTokenKey } from './client.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user?: { id: string; email: string };
  organization?: { id: string; name: string };
  accessToken: string;
  refreshToken: string;
}

export function persistTokens(tokens: { accessToken?: string; refreshToken?: string }) {
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error('Authentication response missing tokens');
  }
  localStorage.setItem(accessTokenKey, tokens.accessToken);
  localStorage.setItem(refreshTokenKey, tokens.refreshToken);
  window.dispatchEvent(new Event('leadguard-auth-changed'));
}

export function clearTokens() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
  window.dispatchEvent(new Event('leadguard-auth-changed'));
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem(accessTokenKey));
}

export async function login(input: { email: string; password: string }): Promise<AuthResult> {
  const data = await apiClient<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  persistTokens(data);
  return data;
}

export async function register(input: {
  email: string;
  password: string;
  organizationName?: string;
}): Promise<AuthResult> {
  const data = await apiClient<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  persistTokens(data);
  return data;
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem(refreshTokenKey);
  if (token) {
    await apiClient<void>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {});
  }
  clearTokens();
}
