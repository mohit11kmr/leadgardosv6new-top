import { describe, it, expect } from 'vitest';
import { getVaultRemediation, hasRemediationCoverageForAllKnownKeys } from './vault-remediation.js';
import { VAULT_DETECTION_KEYS } from './vault/registry.js';

describe('VaultGuard AI Remediation (LG-039)', () => {
  it('returns a real Summary/Impact/Mitigation guide for every registered detection key', () => {
    for (const meta of VAULT_DETECTION_KEYS) {
      const guide = getVaultRemediation(meta.key);
      expect(guide, `missing remediation guide for ${meta.key}`).not.toBeNull();
      expect(guide!.summaryHi.length).toBeGreaterThan(10);
      expect(guide!.impactHi.length).toBeGreaterThan(10);
      expect(guide!.mitigationSteps.length).toBeGreaterThan(0);
    }
  });

  it('never fabricates guidance for an unknown key', () => {
    expect(getVaultRemediation('SOME_KEY_THAT_DOES_NOT_EXIST')).toBeNull();
  });

  it('has zero coverage gaps against the live detection-key registry (catches drift)', () => {
    const { missing } = hasRemediationCoverageForAllKnownKeys(VAULT_DETECTION_KEYS.map((k) => k.key));
    expect(missing).toEqual([]);
  });

  it('returns the same guide content on repeated calls (deterministic, not per-call AI generation)', () => {
    const a = getVaultRemediation('SEC_DEBUG_MODE');
    const b = getVaultRemediation('SEC_DEBUG_MODE');
    expect(a).toEqual(b);
  });
});
