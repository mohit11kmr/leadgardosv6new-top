const base = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
export const accessTokenKey = 'leadguard.accessToken';
export const refreshTokenKey = 'leadguard.refreshToken';

export function persistTokens(value: { accessToken?: string; refreshToken?: string }) {
  if (!value.accessToken || !value.refreshToken) throw new Error('Authentication response did not contain tokens');
  localStorage.setItem(accessTokenKey, value.accessToken);
  localStorage.setItem(refreshTokenKey, value.refreshToken);
  window.dispatchEvent(new Event('leadguard-auth-changed'));
}

export function clearTokens() {
  localStorage.removeItem(accessTokenKey);
  localStorage.removeItem(refreshTokenKey);
  window.dispatchEvent(new Event('leadguard-auth-changed'));
}

export type ApiResult<T> = { success: true; data: T; meta?: Record<string, unknown> };

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(accessTokenKey);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${base}${normalizedPath}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error?.message ?? 'Request failed');
  return body.data as T;
}

export async function auth(path: string, input: unknown) {
  const authPath = path.startsWith('/auth/') ? path : `/auth/${path.replace(/^\//, '')}`;
  const data = await api<{ accessToken?: string; refreshToken?: string }>(authPath, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  persistTokens(data);
  return { accessToken: data.accessToken!, refreshToken: data.refreshToken! };
}
