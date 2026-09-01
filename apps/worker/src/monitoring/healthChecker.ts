import { fetchPage, classifyError } from '../audit/fetcher.js';
import { inspectTls } from '@leadguard/shared';
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

    // Real TLS inspection (actual certificate handshake + expiry), same
    // helper the VaultGuard security scan already uses — this used to be a
    // hardcoded "expires 90 days from now" regardless of the real
    // certificate, which meant the "TLS Certificate Expiring Soon" alert
    // could never fire accurately.
    let tlsValid = false;
    let tlsExpiresAt: Date | null = null;
    if (isHttps) {
      const tlsResult = await inspectTls(targetUrl);
      tlsValid = tlsResult.certificateValid;
      tlsExpiresAt =
        tlsResult.daysRemaining !== undefined
          ? new Date(Date.now() + tlsResult.daysRemaining * 86400000)
          : null;
    }

    return {
      isAvailable,
      httpStatus: page.statusCode || null,
      responseTimeMs: duration,
      tlsValid,
      tlsExpiresAt,
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
