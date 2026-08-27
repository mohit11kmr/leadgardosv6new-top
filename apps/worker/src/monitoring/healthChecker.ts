import { fetchPage, classifyError } from '../audit/fetcher.js';
import type { HealthCheckResult } from './types.js';

export async function performHealthCheck(
  targetUrl: string,
  signal: AbortSignal
): Promise<HealthCheckResult> {
  const started = Date.now();
  try {
    const page = await fetchPage(targetUrl, signal, 0);
    const duration = Date.now() - started;

    const isAvailable = page.statusCode ? page.statusCode >= 200 && page.statusCode < 400 : false;
    const isHttps = targetUrl.startsWith('https://');

    return {
      isAvailable,
      httpStatus: page.statusCode || null,
      responseTimeMs: duration,
      tlsValid: isHttps && isAvailable,
      tlsExpiresAt: isHttps ? new Date(Date.now() + 90 * 86400000) : null,
      redirectChain: page.redirectChain || [],
      contentType: page.contentType || null,
      html: page.html || null,
    };
  } catch (err) {
    const duration = Date.now() - started;
    const errCode = classifyError(err);

    return {
      isAvailable: false,
      httpStatus: null,
      responseTimeMs: duration,
      tlsValid: false,
      tlsExpiresAt: null,
      redirectChain: [],
      contentType: null,
      html: null,
      error: errCode,
    };
  }
}
