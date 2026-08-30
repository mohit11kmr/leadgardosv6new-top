export interface MinimalHttpRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Resolves the client IP honoring the Express `trust proxy` configuration.
 *
 * When `trust proxy` is enabled, Express populates `req.ip` from the
 * trusted reverse-proxy chain (x-forwarded-for). When it is disabled
 * (the default), `req.ip` resolves to the socket's remote address, so a
 * client-controlled `x-forwarded-for` header cannot be used to spoof
 * their identity and bypass rate limits.
 */
export function getClientIp(req: MinimalHttpRequest): string {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

export function getClientUserAgent(req: MinimalHttpRequest): string | undefined {
  const ua = req.headers['user-agent'];
  return Array.isArray(ua) ? ua[0] : ua;
}