import { db } from '@leadguard/database';
import {
  collectVaultFindings,
  inspectTls,
  validateExternalUrl,
  type ExposedAssetFacts,
  type LoginFormFacts,
  type PageRecord,
  type ScannerContext,
  type TlsHealthFacts,
  type VaultFinding,
  type VaultProbeFacts,
} from '@leadguard/shared';

const DEBUG_PROBE_PATHS = [
  '/.env',
  '/.env.backup',
  '/.env.local',
  '/.git/config',
  '/.git/HEAD',
  '/_ignition/health-check',
  '/_debug',
  '/.well-known/security.txt',
];

const BACKUP_PROBE_PATHS = [
  '/backup.zip',
  '/backup.tar.gz',
  '/site.zip',
  '/old.zip',
  '/backups/',
  '/wp-config.php.bak',
  '/.htaccess.bak',
];

const DIR_LISTING_MARKERS = [/index of \//i, /directory listing/i, /parent directory/i];

const PROBE_TIMEOUT_MS = 4000;
const MAX_PROBE_BYTES = 64 * 1024;

interface DiscoveryResult {
  findings: VaultFinding[];
  tls?: TlsHealthFacts;
  probeCount: number;
  probeDurationMs: number;
}

function isDirectoryListing(html: string): boolean {
  return DIR_LISTING_MARKERS.some((r) => r.test(html));
}

function extractLoginForms(pages: PageRecord[]): LoginFormFacts[] {
  const forms: LoginFormFacts[] = [];

  for (const page of pages) {
    const formMatches = [...page.html.matchAll(/<form[^>]*>/gi)];
    if (formMatches.length === 0) continue;

    for (const formMatch of formMatches) {
      const formTag = formMatch[0];
      const actionMatch = formTag.match(/action=["']([^"']*)["']/i);
      const action = actionMatch?.[1]
        ? new URL(actionMatch[1], page.finalUrl).toString()
        : page.finalUrl;

      const formBlockStart = formMatch.index ?? 0;
      const formBlock = page.html.slice(formBlockStart, formBlockStart + 8192);

      const hasPasswordInput = /<input[^>]+type=["']password["']/i.test(formBlock);
      if (!hasPasswordInput) continue;

      const hasCsrfToken =
        /name=["'](_?csrf[a-z_-]*|_token|authenticity_token)["']/i.test(formBlock) ||
        /class=["'][^"']*(csrf|token)[^"']*["']/i.test(formBlock);

      const setCookie = page.headers['set-cookie'] ?? '';
      const cookieSampled = setCookie.split(/,(?=\s*\w+=)/i).slice(0, 6);
      const cookie = {
        httpOnly: cookieSampled.some((c) => /;\s*httponly/i.test(c)),
        secure: cookieSampled.some((c) => /;\s*secure/i.test(c)),
        sameSite: cookieSampled.some((c) => /;\s*samesite=(strict|lax)/i.test(c)) ? 'Lax' : undefined,
      };

      const hasThrottle =
        /retry-after/i.test(JSON.stringify(page.headers)) ||
        /x-ratelimit-/i.test(JSON.stringify(page.headers));

      forms.push({ action, hasThrottle, hasCsrfToken, cookie });
    }
  }

  return forms.filter((f, i, arr) => arr.findIndex((x) => x.action === f.action) === i);
}

function extractPageAssets(pages: PageRecord[]): ExposedAssetFacts[] {
  const assets: ExposedAssetFacts[] = [];

  for (const page of pages) {
    if (!page.html) continue;
    if (isDirectoryListing(page.html)) {
      assets.push({
        url: page.finalUrl,
        status: page.statusCode,
        contentType: page.contentType,
        detectedPath: '.listing',
      });
    }

    const maps = [...page.html.matchAll(/src=["']([^"']+\.(?:js\.map|map))["']/gi)];
    for (const m of maps) {
      assets.push({
        url: new URL(m[1]!, page.finalUrl).toString(),
        status: -1,
        contentType: undefined,
        detectedPath: 'source_map',
      });
    }
  }

  return assets;
}

export async function collectVaultProbeFacts(
  websiteUrl: string,
  pages: PageRecord[],
  tlsFacts?: TlsHealthFacts,
  _context?: ScannerContext
): Promise<VaultProbeFacts> {
  const primaryPage = pages.find((p) => p.statusCode === 200 && p.htmlAvailable) ?? pages[0];

  const facts: VaultProbeFacts = {
    websiteUrl,
    tls: tlsFacts,
    loginForms: extractLoginForms(pages),
    exposedAssets: extractPageAssets(pages),
  };

  if (primaryPage) {
    facts.page = {
      url: primaryPage.finalUrl,
      statusCode: primaryPage.statusCode,
      headers: primaryPage.headers,
      html: primaryPage.html,
    };
  }

  return facts;
}

interface ProbeHit {
  url: string;
  status: number;
  contentType?: string;
  detectedPath: string;
}

async function probePath(base: string, path: string, signal: AbortSignal): Promise<ProbeHit | undefined> {
  const url = `${base}${path}`;
  try {
    const validUrl = await validateExternalUrl(url);
    const response = await fetch(validUrl, {
      signal,
      redirect: 'manual',
      headers: {
        'user-agent': 'LeadGuardBot/2.0 (+https://leadguard.local)',
        accept: 'text/html,application/xhtml+xml,application/json,text/plain',
      },
    });
    return {
      url,
      status: response.status,
      contentType: response.headers.get('content-type') ?? undefined,
      detectedPath: path,
    };
  } catch {
    return undefined;
  }
}

async function runHostProbes(websiteUrl: string, pages: PageRecord[], signal: AbortSignal): Promise<ExposedAssetFacts[]> {
  const assets: ExposedAssetFacts[] = [];
  const url = new URL(websiteUrl);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return assets;

  const base = `${url.protocol}//${url.host}`;
  const results = await Promise.allSettled(
    [...DEBUG_PROBE_PATHS, ...BACKUP_PROBE_PATHS].map((path) => probePath(base, path, signal))
  );

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const hit = r.value;
    if (hit.status < 200 || hit.status >= 300) continue;
    assets.push({
      url: hit.url,
      status: hit.status,
      contentType: hit.contentType,
      detectedPath: hit.detectedPath,
    });
  }

  const sourceMapTargets = [
    ...new Set(
      pages
        .flatMap((p) => [...(p.html.matchAll(/src=["']([^"']+\.(?:js\.map|map))["']/gi))])
        .map((m) => new URL(m[1]!, pages.find((p) => p.html.includes(m[0]!))?.finalUrl ?? websiteUrl).toString())
    ),
  ];
  const mapResults = await Promise.allSettled(sourceMapTargets.map((u) => probePath(u, '', signal)));
  for (const r of mapResults) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const hit = r.value;
    if (hit.status < 200 || hit.status >= 300) continue;
    assets.push({ url: hit.url, status: hit.status, contentType: hit.contentType, detectedPath: 'source_map' });
  }

  return assets;
}

export async function runVaultGuardScan(args: {
  websiteUrl: string;
  pages: PageRecord[];
  context?: ScannerContext;
}): Promise<DiscoveryResult> {
  const started = Date.now();
  const { websiteUrl, pages, context } = args;
  const aborter = new AbortController();
  const timer = setTimeout(() => aborter.abort(), 20000);
  const signal = aborter.signal;

  let tls: TlsHealthFacts | undefined;
  try {
    if (/^https:\/\//i.test(websiteUrl)) {
      const tlsRes = await inspectTls(websiteUrl, context);
      tls = {
        isHttps: tlsRes.isHttps,
        certificateValid: tlsRes.certificateValid,
        daysRemaining: tlsRes.daysRemaining,
      };
    }
  } catch {
    tls = undefined;
  }

  const facts = await collectVaultProbeFacts(websiteUrl, pages, tls, context);
  const probeAssets = await runHostProbes(websiteUrl, pages, signal);
  facts.exposedAssets = [...(facts.exposedAssets ?? []), ...probeAssets];

  const findings = collectVaultFindings(facts);
  clearTimeout(timer);

  return {
    findings,
    tls,
    probeCount: DEBUG_PROBE_PATHS.length + BACKUP_PROBE_PATHS.length,
    probeDurationMs: Date.now() - started,
  };
}

export async function upsertVaultFindings(args: {
  auditId?: string | null;
  runId?: string | null;
  websiteId: string;
  findings: VaultFinding[];
}): Promise<number> {
  const { auditId, runId, websiteId, findings } = args;
  if (findings.length === 0) return 0;

  const rows: any[] = findings.map((finding) => {
    const issueKey = finding.normalizedIssueKey ?? finding.internalKey ?? finding.title;
    return {
      ...(auditId ? { auditId } : {}),
      ...(runId ? { runId } : {}),
      websiteId,
      scannerKey: finding.internalKey ?? issueKey,
      normalizedIssueKey: issueKey,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      status: 'OPEN' as const,
      evidence: (finding.evidence ?? {}) as object,
      affectedUrl: finding.affectedUrl ?? null,
      recommendation: finding.recommendation,
      scoreImpact: finding.scoreImpact,
      cwe: finding.cwe ?? null,
      cvssVector: finding.cvssVector ?? null,
      cvssScore: finding.cvssScore ?? null,
      lastSeenAt: new Date(),
    };
  });

  // C6: atomic single-pass upsert (no N+1 read-then-write, no duplicate-insert race).
  // createMany w/ skipDuplicates inserts only brand-new rows; the updateMany below
  // re-opens previously FIXED/VERIFIED rows to OPEN, but never resurrects VERIFIED_IGNORED.
  const created = await db.vaultAuditFinding.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const issueKeys = rows.map((r) => r.normalizedIssueKey);
  await db.vaultAuditFinding.updateMany({
    where: {
      websiteId,
      normalizedIssueKey: { in: issueKeys },
      status: { not: 'VERIFIED_IGNORED' },
      NOT: { status: 'OPEN' },
    },
    data: { status: 'OPEN', lastSeenAt: new Date() },
  });

  return rows.length;
}