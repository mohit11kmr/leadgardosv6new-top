import type { DetectionKeyMeta } from './types.js';

/**
 * Single source of truth for every VaultGuard detection key, mirroring the
 * `normalizedIssueKey` convention. Each key carries HackerOne-style taxonomy
 * (CWE + CVSS 3.1 vector + derived score + severity) and the score penalty it
 * contributes to the overall security pillar (see scoring.ts).
 *
 * CVSS 3.1 vectors are dimensioned from passive probe facts only: AV:N, AC:L,
 * PR:N, UI:R, no scope change, confidentiality/integrity/availability per key.
 */
export const VAULT_DETECTION_KEYS: DetectionKeyMeta[] = [
  {
    key: 'SEC_DEBUG_MODE',
    severity: 'CRITICAL',
    scoreImpact: 30,
    cwe: 'CWE-489',
    hackeroneWeaknessLabel: 'Active Debug Code',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
    cvssScore: 8.8,
  },
  {
    key: 'SEC_ENV_LEAK',
    severity: 'CRITICAL',
    scoreImpact: 24,
    cwe: 'CWE-200',
    hackeroneWeaknessLabel: 'Exposure of Sensitive Information',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    cvssScore: 7.5,
  },
  {
    key: 'SEC_SERVER_LEAK',
    severity: 'MEDIUM',
    scoreImpact: 6,
    cwe: 'CWE-200',
    hackeroneWeaknessLabel: 'Exposure of Sensitive Information',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
    cvssScore: 5.3,
  },
  {
    key: 'SEC_EXPIRED_CERT',
    severity: 'HIGH',
    scoreImpact: 18,
    cwe: 'CWE-295',
    hackeroneWeaknessLabel: 'Improper Certificate Validation',
    cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:N',
    cvssScore: 6.8,
  },
  {
    key: 'SEC_WEAK_TLS',
    severity: 'MEDIUM',
    scoreImpact: 8,
    cwe: 'CWE-327',
    hackeroneWeaknessLabel: 'Use of a Broken or Risky Cryptographic Algorithm',
    cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N',
    cvssScore: 5.9,
  },
  {
    key: 'SEC_MISSING_HSTS',
    severity: 'LOW',
    scoreImpact: 4,
    cwe: 'CWE-693',
    hackeroneWeaknessLabel: 'Protection Mechanism Failure',
    cvssVector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:H/A:H',
    cvssScore: 7.1,
  },
  {
    key: 'SEC_NO_AUTH_RATE_LIMIT',
    severity: 'MEDIUM',
    scoreImpact: 10,
    cwe: 'CWE-307',
    hackeroneWeaknessLabel: 'Improper Restriction of Excessive Authentication Attempts',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N',
    cvssScore: 6.5,
  },
  {
    key: 'SEC_INSECURE_AUTH_COOKIE',
    severity: 'MEDIUM',
    scoreImpact: 8,
    cwe: 'CWE-614',
    hackeroneWeaknessLabel: 'Sensitive Cookie Without Secure Attribute',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N',
    cvssScore: 5.4,
  },
  {
    key: 'SEC_EXPOSED_BACKUP',
    severity: 'HIGH',
    scoreImpact: 16,
    cwe: 'CWE-530',
    hackeroneWeaknessLabel: 'Exposure of Backup File to an Unauthorized Control Sphere',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    cvssScore: 7.5,
  },
  {
    key: 'SEC_DIRECTORY_LISTING',
    severity: 'MEDIUM',
    scoreImpact: 8,
    cwe: 'CWE-16',
    hackeroneWeaknessLabel: 'Configuration',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
    cvssScore: 5.3,
  },
  {
    key: 'SEC_SOURCE_MAP_LEAK',
    severity: 'LOW',
    scoreImpact: 4,
    cwe: 'CWE-200',
    hackeroneWeaknessLabel: 'Exposure of Sensitive Information',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N',
    cvssScore: 5.3,
  },
  {
    key: 'SEC_CSP_REPORT',
    severity: 'LOW',
    scoreImpact: 3,
    cwe: 'CWE-693',
    hackeroneWeaknessLabel: 'Protection Mechanism Failure',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N',
    cvssScore: 5.4,
  },
  {
    key: 'SEC_POLICY_MALFORMED',
    severity: 'LOW',
    scoreImpact: 3,
    cwe: 'CWE-16',
    hackeroneWeaknessLabel: 'Configuration',
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:N',
    cvssScore: 5.3,
  },
];

const keyMap = new Map<string, DetectionKeyMeta>(VAULT_DETECTION_KEYS.map((k) => [k.key, k]));

export function detectionKey(key: string): DetectionKeyMeta | undefined {
  return keyMap.get(key);
}
