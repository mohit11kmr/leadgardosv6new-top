import { detectionKey } from './registry.js';
import type { ExposedAssetFacts, VaultFinding, VaultProbeFacts, VaultScanner } from './types.js';

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
    businessImpact: 'Exposes source code, backups, or file inventories that accelerate targeted attacks.',
  };
}

const BACKUP_PATTERNS = /\.(zip|bak|sql|tar|gz|7z)$/i;
const BACKUP_KEYWORDS = /(backup|dump|export|full|archive|\d{4}-\d{2}-\d{2})/i;

function classifyAsset(a: ExposedAssetFacts): 'BACKUP' | 'LISTING' | 'SOURCEMAP' | 'NONE' {
  const url = a.url.toLowerCase();
  const isDir = a.detectedPath === '.listing' || (a.contentType ?? '').includes('directory');
  if (isDir) return 'LISTING';
  if (/\.(map)$/i.test(url) || /sourceMappingURL/.test((a.contentType ?? '').toLowerCase())) return 'SOURCEMAP';
  if (BACKUP_PATTERNS.test(url) || (BACKUP_KEYWORDS.test(a.detectedPath ?? '') && /\.(zip|bak|sql|tar|gz|7z|log|txt)$/i.test(a.detectedPath ?? ''))) {
    return 'BACKUP';
  }
  return 'NONE';
}

/**
 * Phase 1 host-level scanner: identifies exposed sensitive/asset files
 * (backups, directory listings, source maps) from collected probe facts.
 */
export const exposedAssetScanner: VaultScanner = {
  key: 'SEC_EXPOSED_ASSET',
  phase: 1,
  name: 'Exposed Assets & Directory Listing',
  probe(facts: VaultProbeFacts): VaultFinding[] {
    const findings: VaultFinding[] = [];
    const assets = facts.exposedAssets ?? [];
    if (assets.length === 0) return findings;

    for (const asset of assets) {
      if (asset.status < 200 || asset.status >= 300) continue;
      const kind = classifyAsset(asset);
      if (kind === 'NONE') continue;

      const metadata: Record<string, unknown> = {
        path: asset.detectedPath,
        status: asset.status,
        contentType: asset.contentType,
      };

      if (kind === 'BACKUP') {
        const meta = detectionKey('SEC_EXPOSED_BACKUP')!;
        findings.push(
          baseFinding(
            meta,
            'Sensitive backup / database file exposed',
            `A backup or database file is publicly downloadable (${asset.url}).`,
            `GET ${asset.url} returned HTTP ${asset.status}.`,
            'Publicly accessible backups often contain credentials, customer data, and source code.',
            'Store backups off the web root and block download by extension.',
            asset.url,
            metadata
          )
        );
      } else if (kind === 'LISTING') {
        const meta = detectionKey('SEC_DIRECTORY_LISTING')!;
        findings.push(
          baseFinding(
            meta,
            'Directory listing enabled',
            'The server returns a directory index, revealing the site file inventory.',
            `Directory listing detected at ${asset.url}.`,
            'Directory listings enumerate files and expose internal structure to attackers.',
            'Disable auto-index / directory listing in the web server.',
            asset.url,
            metadata
          )
        );
      } else if (kind === 'SOURCEMAP') {
        const meta = detectionKey('SEC_SOURCE_MAP_LEAK')!;
        findings.push(
          baseFinding(
            meta,
            'JavaScript source map exposed',
            `A source map file is publicly accessible (${asset.url}).`,
            `GET ${asset.url} returned HTTP ${asset.status}.`,
            'Source maps reconstruct original frontend source, aiding reverse-engineering and API discovery.',
            'Remove source maps from production builds or restrict access.',
            asset.url,
            metadata
          )
        );
      }
    }

    return findings;
  },
};
