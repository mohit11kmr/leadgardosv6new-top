export interface NormalizeUrlOptions {
  stripFragment?: boolean;
  stripTrailingSlash?: boolean;
  sortQueryParams?: boolean;
  removeDefaultPort?: boolean;
  lowercaseHostname?: boolean;
}

const DEFAULT_OPTIONS: Required<NormalizeUrlOptions> = {
  stripFragment: true,
  stripTrailingSlash: true,
  sortQueryParams: true,
  removeDefaultPort: true,
  lowercaseHostname: true,
};

export function normalizeUrl(rawUrl: string, options?: NormalizeUrlOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    // If protocol missing, default to https
    try {
      url = new URL(`https://${rawUrl.trim()}`);
    } catch {
      return rawUrl.trim();
    }
  }

  // Protocol normalization (must be http or https)
  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return rawUrl.trim();
  }

  // Hostname normalization
  let hostname = url.hostname;
  if (opts.lowercaseHostname) {
    hostname = hostname.toLowerCase().replace(/\.$/, '');
  }

  // Port normalization
  let port = url.port;
  if (opts.removeDefaultPort) {
    if ((protocol === 'http:' && port === '80') || (protocol === 'https:' && port === '443')) {
      port = '';
    }
  }

  // Path normalization
  let pathname = url.pathname || '/';
  if (opts.stripTrailingSlash && pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '');
  }

  // Query parameter sorting & deduplication
  let search = '';
  if (url.search) {
    const params = new URLSearchParams(url.search);
    if (opts.sortQueryParams) {
      params.sort();
    }
    const searchString = params.toString();
    search = searchString ? `?${searchString}` : '';
  }

  // Fragment
  const hash = opts.stripFragment ? '' : url.hash;

  const hostPort = port ? `${hostname}:${port}` : hostname;
  return `${protocol}//${hostPort}${pathname}${search}${hash}`;
}

export function areUrlsEquivalent(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2);
}
