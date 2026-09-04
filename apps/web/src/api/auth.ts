import { accessTokenKey, apiClient } from './client.js';

export interface UserSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  isCurrent: boolean;
}

export interface AuthResult {
  user?: { id: string; email: string; platformAdmin?: boolean };
  organization?: { id: string; name: string };
  accessToken: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  emailVerified: boolean;
  platformAdmin: boolean;
  platformCapabilities?: string[];
  platformRole?: string | null;
}

export interface MeResult {
  user: CurrentUser;
  organization: { id: string; name: string; slug: string } | null;
}

export function persistAccessToken(token: string) {
  localStorage.setItem(accessTokenKey, token);
  window.dispatchEvent(new Event('leadguard-auth-changed'));
}

export function clearAccessToken() {
  localStorage.removeItem(accessTokenKey);
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
  if (data.accessToken) {
    persistAccessToken(data.accessToken);
  }
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
  if (data.accessToken) {
    persistAccessToken(data.accessToken);
  }
  return data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient<void>('/auth/logout', {
      method: 'POST',
    });
  } catch {
    // Ignore network errors on logout
  } finally {
    clearAccessToken();
  }
}

export async function logoutAll(): Promise<void> {
  try {
    await apiClient<void>('/auth/logout-all', {
      method: 'POST',
    });
  } finally {
    clearAccessToken();
  }
}

export async function getMe(): Promise<MeResult> {
  return apiClient<MeResult>('/auth/me');
}

export async function getSessions(): Promise<UserSession[]> {
  return apiClient<UserSession[]>('/auth/sessions');
}

export async function revokeSession(id: string): Promise<void> {
  return apiClient<void>(`/auth/sessions/${id}`, {
    method: 'DELETE',
  });
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(token: string, newPassword: string): Promise<{ success: boolean }> {
  return apiClient<{ success: boolean }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}
