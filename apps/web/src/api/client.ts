export const accessTokenKey = 'leadguard.accessToken';

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

// In-flight refresh promise for concurrent request deduplication (Requirement 32)
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshRes = await fetch(`${base}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include', // Sends HttpOnly leadguard_refresh_token cookie
      });

      const refreshData = await refreshRes.json().catch(() => ({}));
      if (refreshRes.ok && refreshData.success && refreshData.data?.accessToken) {
        const newAccessToken = refreshData.data.accessToken as string;
        localStorage.setItem(accessTokenKey, newAccessToken);
        window.dispatchEvent(new Event('leadguard-auth-changed'));
        return newAccessToken;
      }

      // If refresh fails, clear token and notify
      localStorage.removeItem(accessTokenKey);
      window.dispatchEvent(new Event('leadguard-auth-changed'));
      return null;
    } catch {
      localStorage.removeItem(accessTokenKey);
      window.dispatchEvent(new Event('leadguard-auth-changed'));
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

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
    credentials: 'include', // Transmits HttpOnly session cookies
  });

  if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
    // Attempt deduplicated token refresh via HttpOnly cookie
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      headers.authorization = `Bearer ${newAccessToken}`;
      const retryRes = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
      const retryBody = await retryRes.json().catch(() => ({}));
      if (!retryRes.ok || !retryBody.success) {
        throw new ApiError(
          retryBody.error?.message ?? 'Request failed after refresh',
          retryBody.error?.code ?? 'API_ERROR',
          retryRes.status,
          retryBody.error?.requestId
        );
      }
      return retryBody.data as T;
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
