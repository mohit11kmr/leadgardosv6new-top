import type { Finding, Severity } from '../types.js';

/**
 * VaultGuard — advanced website security / bug diagnostics.
 *
 * Scanners operate in two phases:
 *  - phase 0: page-level, pure analysis over already-fetched page records
 *             (headers, HTML, status) — no additional network I/O.
 *  - phase 1: host-level, one-shot probes that may make light, read-only
 *             requests (e.g. cert inspection, a HEAD probe for a favicon).
 *
 * To keep every scanner deterministic and offline-testable, each scanner
 * exposes a PURE core (`probe(facts)`) that classifies a pre-collected
 * `VaultProbeFacts` bundle, plus (where needed) an async collector that
 * gathers those facts. Tests drive the pure core directly with crafted
 * fixtures, guaranteeing ">=1 real positive, zero false-positives".
 */

export type VaultScanPhase = 0 | 1;

export interface TlsHealthFacts {
  isHttps: boolean;
  certificateValid: boolean;
  daysRemaining?: number;
  protocolVersion?: string;
  hsts?: string;
  weakCipher?: boolean;
}

export interface LoginFormFacts {
  action: string;
  hasThrottle: boolean;
  hasCsrfToken: boolean;
  cookie: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string | null;
  };
}

export interface ExposedAssetFacts {
  url: string;
  status: number;
  contentType?: string;
  detectedPath?: string;
}

/**
 * Everything a scanner needs, pre-collected by the orchestrator/collector.
 * Page-level facts are optional since host-level scanners may only act on
 * TLS/probe facts and vice-versa.
 */
export interface VaultProbeFacts {
  websiteUrl: string;
  page?: {
    url: string;
    statusCode: number;
    headers: Record<string, string>;
    html: string;
  };
  tls?: TlsHealthFacts;
  loginForms?: LoginFormFacts[];
  exposedAssets?: ExposedAssetFacts[];
}

export interface VaultScannerContext {
  auditId: string;
  websiteUrl: string;
  signal?: AbortSignal;
  facts: VaultProbeFacts;
}

/**
 * A VaultGuard finding = a standard `Finding` tagged with HackerOne-style
 * taxonomy (CWE + CVSS 3.1) so it can be exported to bug-tracking tools and
 * re-used by the existing scoring/evidence/priority pipeline.
 */
export interface VaultFinding extends Finding {
  cwe?: string;
  cvssVector?: string;
  cvssScore?: number;
}

export interface VaultScanner {
  key: 'SEC_DEBUG_EXPOSURE' | 'SEC_SSL_HEALTH' | 'SEC_AUTH_GUARD' | 'SEC_EXPOSED_ASSET' | 'SEC_HEADER_AUDIT';
  phase: VaultScanPhase;
  name: string;
  probe(facts: VaultProbeFacts): VaultFinding[];
}

export interface VaultProbeResult {
  scannerKey: string;
  status: 'COMPLETED' | 'FAILED';
  findings: VaultFinding[];
  error?: string;
}

export interface DetectionKeyMeta {
  key: string;
  severity: Severity;
  scoreImpact: number;
  cwe: string;
  hackeroneWeaknessLabel: string;
  cvssVector: string;
  cvssScore: number;
}
