import { authGuardScanner } from './auth-guard.js';
import { debugExposureScanner } from './debug-exposure.js';
import { exposedAssetScanner } from './exposed-asset.js';
import { securityHeaderAuditScanner } from './security-headers.js';
import { sslHealthScanner } from './ssl-health.js';
import type { VaultFinding, VaultProbeFacts, VaultProbeResult, VaultScanner } from './types.js';

export * from './types.js';
export * from './registry.js';
export * from './debug-exposure.js';
export * from './ssl-health.js';
export * from './auth-guard.js';
export * from './exposed-asset.js';
export * from './security-headers.js';

export const VAULT_SCANNERS: VaultScanner[] = [
  debugExposureScanner,
  sslHealthScanner,
  authGuardScanner,
  exposedAssetScanner,
  securityHeaderAuditScanner,
];

export function runVaultProbe(facts: VaultProbeFacts): VaultProbeResult[] {
  return VAULT_SCANNERS.map((scanner): VaultProbeResult => {
    try {
      return {
        scannerKey: scanner.key,
        status: 'COMPLETED',
        findings: scanner.probe(facts),
      };
    } catch (error) {
      return {
        scannerKey: scanner.key,
        status: 'FAILED',
        findings: [],
        error: error instanceof Error ? error.message : 'Unknown scanner error',
      };
    }
  });
}

export function collectVaultFindings(facts: VaultProbeFacts): VaultFinding[] {
  return runVaultProbe(facts).flatMap((r) => r.findings);
}
