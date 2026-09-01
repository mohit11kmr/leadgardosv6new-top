import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression test for the "dead code" audit finding: MonitoringScheduler.start()
// and MonitoringRetentionCleaner.cleanupOldRuns() were fully implemented and
// unit-tested in isolation, but nothing in the actual worker entrypoint ever
// invoked them — so recurring monitoring checks and retention cleanup never
// ran outside of tests. This statically verifies the entrypoint wires them up,
// the same source-inspection pattern already used in architecture.test.ts.
describe('Worker entrypoint wiring (previously-dead monitoring jobs)', () => {
  const workerSource = fs.readFileSync(
    path.join(process.cwd(), 'apps/worker/src/worker.ts'),
    'utf-8'
  );

  it('imports the monitoring scheduler and retention cleaner singletons', () => {
    expect(workerSource).toMatch(/import\s*\{\s*monitoringScheduler\s*\}\s*from\s*['"].*monitoring\/scheduler\.js['"]/);
    expect(workerSource).toMatch(/import\s*\{\s*monitoringCleaner\s*\}\s*from\s*['"].*monitoring\/cleanup\.js['"]/);
  });

  it('starts the monitoring scheduler at process boot', () => {
    expect(workerSource).toMatch(/monitoringScheduler\.start\(/);
  });

  it('schedules recurring retention cleanup', () => {
    expect(workerSource).toMatch(/monitoringCleaner\.cleanupOldRuns\(/);
    // Must be inside a setInterval, not a one-shot call.
    const cleanupIndex = workerSource.indexOf('monitoringCleaner.cleanupOldRuns(');
    const precedingSource = workerSource.slice(0, cleanupIndex);
    const lastIntervalIndex = precedingSource.lastIndexOf('setInterval(');
    expect(lastIntervalIndex).toBeGreaterThan(-1);
  });

  it('stops the scheduler and clears the retention timer on graceful shutdown', () => {
    const shutdownIndex = workerSource.indexOf('handleWorkerShutdown = async');
    expect(shutdownIndex).toBeGreaterThan(-1);
    const shutdownBody = workerSource.slice(shutdownIndex);
    expect(shutdownBody).toMatch(/monitoringScheduler\.stop\(\)/);
    expect(shutdownBody).toMatch(/clearInterval\(retentionCleanupTimer\)/);
  });
});

describe('Audit orchestrator wiring (headless-browser rendered rescan)', () => {
  const orchestratorSource = fs.readFileSync(
    path.join(process.cwd(), 'apps/worker/src/audit/orchestrator.ts'),
    'utf-8'
  );

  it('gates the rendered rescan behind config.ENABLE_JS_RENDERED_RESCAN', () => {
    expect(orchestratorSource).toMatch(/if\s*\(\s*config\.ENABLE_JS_RENDERED_RESCAN/);
  });

  it('merges rendered signals via mergeRenderedSignals rather than overwriting the static scan', () => {
    expect(orchestratorSource).toMatch(/mergeRenderedSignals\(/);
  });
});
