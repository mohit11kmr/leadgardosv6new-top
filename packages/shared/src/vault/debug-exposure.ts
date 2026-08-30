import { detectionKey } from './registry.js';
import type { VaultFinding, VaultProbeFacts, VaultScanner } from './types.js';

const STACK_TRACE_MARKERS = [
  /Stack trace:/i,
  /#0\s+\w+\(/,
  /at\s+[\w.]+\.\w+.*\(/,
  /in\s+\/[\w\-./]+\.php:line \d+/i,
  /local\.ERROR:/i,
];

const DEBUG_MODE_PATHS = ['/.env', '/.env.backup', '/.git/config', '/_debug', '/_ignition/health-check'];

function baseFinding(
  meta: { key: string; severity: string; scoreImpact: number; cwe: string; cvssVector: string; cvssScore: number },
  title: string,
  description: string,
  observed: string,
  why: string,
  recommendation: string,
  affectedUrl: string,
  metadata: Record<string, unknown> = {}
): VaultFinding {
  return {
    ruleId: 'LG-038',
    internalKey: meta.key,
    normalizedIssueKey: meta.key,
    category: 'SECURITY',
    scope: 'WEBSITE',
    severity: meta.severity as VaultFinding['severity'],
    title,
    description,
    affectedUrl,
    evidence: {
      source: 'vault-probe',
      observed,
      location: affectedUrl,
      why,
      recommendation,
      metadata,
    },
    recommendation,
    scoreImpact: meta.scoreImpact,
    cwe: meta.cwe,
    cvssVector: meta.cvssVector,
    cvssScore: meta.cvssScore,
    businessImpact: 'Exposes internal environment, credentials, source, or application state to any unauthenticated visitor.',
  };
}

/**
 * Phase 1 host-level scanner: looks for application debug remnants and
 * sensitive file exposure. Classifies pre-collected probe facts (server
 * header, body markers, and probe-path hit list).
 */
export const debugExposureScanner: VaultScanner = {
  key: 'SEC_DEBUG_EXPOSURE',
  phase: 1,
  name: 'Debug & Configuration Exposure',
  probe(facts: VaultProbeFacts): VaultFinding[] {
    const findings: VaultFinding[] = [];
    const page = facts.page;
    const body = page?.html ?? '';
    const headers = page?.headers ?? {};
    const websiteUrl = facts.websiteUrl;

    // 1. Server/framework version disclosure from headers.
    //    X-Powered-By always leaks framework+version; the Server header is only
    //    a disclosure when it includes an explicit version number (a bare
    //    "server: nginx" banner is normal and not reported).
    const poweredBy = headers['x-powered-by'];
    const serverHeader = headers['server'];
    let disclosed: string | undefined;
    if (poweredBy) {
      disclosed = poweredBy;
    } else if (serverHeader && /\d/.test(serverHeader)) {
      disclosed = serverHeader;
    }
    if (disclosed) {
      const meta = detectionKey('SEC_SERVER_LEAK')!;
      findings.push(
        baseFinding(
          meta,
          'Server/framework version disclosure',
          'The response discloses the server or framework version, which aids targeted exploitation.',
          `Header reveals: "${disclosed}"`,
          'Version banners tell attackers exactly which known-exploitable versions are running.',
          'Remove or disable X-Powered-By and server-version banners; hide detailed Server headers.',
          page?.url ?? websiteUrl,
          { headerValue: disclosed }
        )
      );
    }

    // 2. Stack-trace / debug error disclosure in body.
    const stackHit = STACK_TRACE_MARKERS.find((r) => r.test(body));
    if (stackHit) {
      const meta = detectionKey('SEC_DEBUG_MODE')!;
      findings.push(
        baseFinding(
          meta,
          'Production debug output / stack trace exposed',
          'The page returned a raw stack trace or debug error, which leaks internal paths and application state.',
          'Stack-trace or debug marker found in response body.',
          'Debug mode is enabled in production; stack traces disclose internal file paths, dependencies, and code structure (an RCE enabler).',
          'Set APP_DEBUG=false in production and log errors server-side instead of rendering them.',
          page?.url ?? websiteUrl,
          { marker: stackHit.source }
        )
      );
    }

    // 3. Debug-mode endpoint flags (Laravel Ignition kind marker in body path).
    const debugPath = (facts.exposedAssets ?? []).find((a) =>
      DEBUG_MODE_PATHS.includes(a.detectedPath ?? '')
    );
    if (debugPath && debugPath.status >= 200 && debugPath.status < 300) {
      const meta = detectionKey('SEC_DEBUG_MODE')!;
      findings.push(
        baseFinding(
          meta,
          'Sensitive debug/configuration endpoint exposed',
          `A sensitive endpoint returned an accessible status (${debugPath.status}).`,
          `GET ${debugPath.detectedPath} returned HTTP ${debugPath.status}.`,
          'Live debug/health endpoints (e.g. Laravel _ignition, .env, .git) are a known credential/RCE exposure when reachable in production.',
          'Block access to debug/health/dotfile endpoints at the reverse proxy; remove them from production deployments.',
          debugPath.url,
          { path: debugPath.detectedPath, status: debugPath.status }
        )
      );
    }

    return findings;
  },
};
