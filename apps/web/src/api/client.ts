export const accessTokenKey = 'leadguard.accessToken';
export const refreshTokenKey = 'leadguard.refreshToken';

export class ApiError extends Error {
  code: string;
  requestId?: string;
  statusCode: number;

  constructor(message: string, code = 'API_ERROR', statusCode = 500, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
  }
}

const base = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(accessTokenKey);
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${base}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !endpoint.includes('/auth/')) {
    // Attempt token refresh
    const refreshToken = localStorage.getItem(refreshTokenKey);
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${base}/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const refreshData = await refreshRes.json();
        if (refreshRes.ok && refreshData.success && refreshData.data?.accessToken) {
          localStorage.setItem(accessTokenKey, refreshData.data.accessToken);
          if (refreshData.data.refreshToken) {
            localStorage.setItem(refreshTokenKey, refreshData.data.refreshToken);
          }
          window.dispatchEvent(new Event('leadguard-auth-changed'));
          // Retry initial request with new access token
          headers.authorization = `Bearer ${refreshData.data.accessToken}`;
          const retryRes = await fetch(url, { ...options, headers });
          const retryBody = await retryRes.json();
          if (!retryRes.ok || !retryBody.success) {
            throw new ApiError(
              retryBody.error?.message ?? 'Request failed',
              retryBody.error?.code ?? 'API_ERROR',
              retryRes.status,
              retryBody.error?.requestId
            );
          }
          return retryBody.data as T;
        }
      } catch {
        // Clear invalid tokens on failed refresh
        localStorage.removeItem(accessTokenKey);
        localStorage.removeItem(refreshTokenKey);
        window.dispatchEvent(new Event('leadguard-auth-changed'));
      }
    }
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    throw new ApiError(
      body.error?.message ?? 'Request failed',
      body.error?.code ?? 'API_ERROR',
      response.status,
      body.error?.requestId
    );
  }

  return body.data as T;
}
