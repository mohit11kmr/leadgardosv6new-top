import { describe, it, expect } from 'vitest';
import { exposedAssetScanner, type VaultFinding, type VaultProbeFacts } from '@leadguard/shared';

function assetFacts(overrides: Partial<VaultProbeFacts> = {}): VaultProbeFacts {
  return {
    websiteUrl: 'https://example.com/',
    exposedAssets: [],
    ...overrides,
  };
}

const keys = (findings: VaultFinding[]) => findings.map((f) => f.normalizedIssueKey);

describe('VaultGuard: exposed-asset scanner (LG-038)', () => {
  it('flags a downloadable backup/zip file as HIGH', () => {
    const facts = assetFacts({
      exposedAssets: [{ url: 'https://example.com/backups/site-2026-08-01.zip', status: 200, contentType: 'application/zip', detectedPath: '/backups/site-2026-08-01.zip' }],
    });
    const findings = exposedAssetScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_EXPOSED_BACKUP');
    expect(findings.find((f) => f.normalizedIssueKey === 'SEC_EXPOSED_BACKUP')?.severity).toBe('HIGH');
  });

  it('flags a directory listing', () => {
    const facts = assetFacts({
      exposedAssets: [{ url: 'https://example.com/uploads/', status: 200, contentType: 'text/html; charset=utf-8', detectedPath: '.listing' }],
    });
    const findings = exposedAssetScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_DIRECTORY_LISTING');
  });

  it('flags a JavaScript source map leak', () => {
    const facts = assetFacts({
      exposedAssets: [{ url: 'https://example.com/assets/app.js.map', status: 200, contentType: 'application/json', detectedPath: '/assets/app.js.map' }],
    });
    const findings = exposedAssetScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_SOURCE_MAP_LEAK');
  });

  it('ignores 404s and benign assets', () => {
    const facts = assetFacts({
      exposedAssets: [{ url: 'https://example.com/favicon.ico', status: 404, contentType: 'image/x-icon', detectedPath: '/favicon.ico' }],
    });
    expect(exposedAssetScanner.probe(facts)).toHaveLength(0);
  });
});
