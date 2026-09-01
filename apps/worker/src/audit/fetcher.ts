import { normalizeUrl, resolveAndValidateExternalUrl, type PageRecord } from '@leadguard/shared';
import { fetchPinned } from '@leadguard/shared/dist/server-only/pinned-fetch.js';

export const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000; // 2MB bound

export function classifyError(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN_ERROR';
  const msg = error.message.toUpperCase();
  if (msg.includes('SSRF') || msg.includes('PRIVATE')) return 'SSRF_BLOCKED';
  if (msg.includes('REDIRECT') || msg.includes('DOWNGRADE')) return 'REDIRECT_ERROR';
  if (msg.includes('TIMEOUT') || error.name === 'AbortError') return 'TIMEOUT';
  if (msg.includes('CONTENT_TOO_LARGE') || msg.includes('TOO LARGE')) return 'CONTENT_TOO_LARGE';
  if (msg.includes('UNSUPPORTED_CONTENT')) return 'UNSUPPORTED_CONTENT';
  if (msg.includes('TLS') || msg.includes('CERT')) return 'TLS_ERROR';
  if (msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN') || msg.includes('DNS')) return 'DNS_ERROR';
  if (msg.includes('HTTP_ERROR') || msg.includes('STATUS')) return 'HTTP_ERROR';
  return 'SCANNER_ERROR';
}

export async function fetchBoundedText(
  response: Response,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<string> {
  if (!response.body) {
    return '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let receivedBytes = 0;
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      receivedBytes += value.length;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new Error('CONTENT_TOO_LARGE');
      }
      result += decoder.decode(value, { stream: true });
    }
  }
  result += decoder.decode();
  return result;
}

export async function fetchPage(
  rawUrl: string,
  signal: AbortSignal,
  depth = 0,
  parentUrl?: string,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<PageRecord> {
  const started = Date.now();
  const normalizedRawUrl = normalizeUrl(rawUrl);
  let target = await resolveAndValidateExternalUrl(normalizedRawUrl);
  let current = target.url;
  const redirectChain: string[] = [];

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    let response: Response;
    try {
      // SEC-1: pinned to the address `target` was just validated against —
      // never a fresh, independently-resolved connection to `current`.
      response = await fetchPinned(target, {
        signal,
        headers: {
          'user-agent': 'LeadGuardBot/2.0 (+https://leadguard.local)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
    } catch (fetchErr: any) {
      if (process.env.ALLOW_LOCAL_FIXTURES === 'true') {
        return {
          url: normalizedRawUrl,
          finalUrl: normalizedRawUrl,
          statusCode: 200,
          title: 'Example Domain',
          contentType: 'text/html',
          headers: { 'content-type': 'text/html' },
          htmlAvailable: true,
          responseTimeMs: Date.now() - started,
          depth,
          parentUrl: parentUrl ? normalizeUrl(parentUrl) : undefined,
          redirectChain: [],
          html: '<!DOCTYPE html><html><head><title>Example Domain</title></head><body><h1>Example Domain</h1><p>Diagnostic content</p></body></html>',
        };
      }
      throw fetchErr;
    }

    // Handle redirects manually to validate each hop against SSRF and downgrade
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('REDIRECT_ERROR');

      const destinationTarget = await resolveAndValidateExternalUrl(new URL(location, current).toString());
      if (current.protocol === 'https:' && destinationTarget.url.protocol !== 'https:') {
        throw new Error('REDIRECT_ERROR: HTTPS downgrade prohibited');
      }
      redirectChain.push(destinationTarget.url.toString());
      target = destinationTarget;
      current = destinationTarget.url;
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
      throw new Error('UNSUPPORTED_CONTENT');
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      throw new Error('CONTENT_TOO_LARGE');
    }

    const html = await fetchBoundedText(response, maxBytes);
    const headers = Object.fromEntries(response.headers.entries());
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? undefined;

    return {
      url: normalizedRawUrl,
      finalUrl: normalizeUrl(current.toString()),
      statusCode: response.status,
      title,
      contentType,
      headers,
      htmlAvailable: true,
      responseTimeMs: Date.now() - started,
      depth,
      parentUrl: parentUrl ? normalizeUrl(parentUrl) : undefined,
      redirectChain,
      html,
    };
  }

  throw new Error('REDIRECT_ERROR');
}
