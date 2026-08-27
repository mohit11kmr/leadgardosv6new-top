import type { AuditTelemetry } from '@leadguard/shared';

export class AuditTelemetryTracker {
  private timings: Partial<AuditTelemetry> = {};
  private stageStarts = new Map<string, number>();

  startStage(stageName: string) {
    this.stageStarts.set(stageName, Date.now());
  }

  endStage(stageName: string, field: keyof AuditTelemetry) {
    const start = this.stageStarts.get(stageName);
    if (start) {
      this.timings[field] = Date.now() - start;
      this.stageStarts.delete(stageName);
    }
  }

  recordCounts(counts: {
    pagesDiscovered?: number;
    pagesFetched?: number;
    pagesFailed?: number;
    findingsGenerated?: number;
  }) {
    if (counts.pagesDiscovered !== undefined) this.timings.pagesDiscovered = counts.pagesDiscovered;
    if (counts.pagesFetched !== undefined) this.timings.pagesFetched = counts.pagesFetched;
    if (counts.pagesFailed !== undefined) this.timings.pagesFailed = counts.pagesFailed;
    if (counts.findingsGenerated !== undefined) this.timings.findingsGenerated = counts.findingsGenerated;
  }

  setMetric(field: keyof AuditTelemetry, value: number) {
    this.timings[field] = value;
  }

  getTelemetry(): AuditTelemetry {
    return { ...this.timings };
  }
}
