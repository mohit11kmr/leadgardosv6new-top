import type { PageRecord } from '@leadguard/shared';
import { scannerRegistry } from '@leadguard/shared';
import type { CrawlOptions } from './types.js';
import { AuditOrchestrator } from './orchestrator.js';

export * from './types.js';
export * from './fetcher.js';
export * from './crawler.js';
export * from './persistence.js';
export * from './aggregation.js';
export * from './finalizer.js';
export * from './telemetry.js';
export * from './orchestrator.js';

export async function scanPage(page: PageRecord) {
  const { findings } = await scannerRegistry.runPageScanners(page);
  return findings;
}

export async function processAudit(
  auditId: string,
  signal: AbortSignal,
  options?: Partial<CrawlOptions>
) {
  const orchestrator = new AuditOrchestrator();
  return orchestrator.execute(auditId, signal, options);
}
