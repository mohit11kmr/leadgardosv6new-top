import { db } from '@leadguard/database';
import type { FinalizationContext } from './types.js';

export async function finalizeAudit(ctx: FinalizationContext): Promise<boolean> {
  const durationMs = Date.now() - ctx.startedAt;

  return db.$transaction(async (tx) => {
    // 1. Guard against duplicate finalization or racing terminal status
    const current = await tx.audit.findUnique({
      where: { id: ctx.auditId },
      select: { status: true },
    });

    if (!current) {
      return false;
    }

    if (current.status === 'CANCELLED' && ctx.status !== 'CANCELLED') {
      // Respect user cancellation
      await tx.auditRun.update({
        where: { id: ctx.runId },
        data: {
          status: 'CANCELLED',
          completedAt: new Date(),
          durationMs,
          errorCode: 'ABORTED',
        },
      });
      return false;
    }

    // 2. Clear old findings and insert deduplicated findings
    await tx.auditFinding.deleteMany({ where: { auditId: ctx.auditId } });

    if (ctx.findings.length) {
      await tx.auditFinding.createMany({
        data: ctx.findings.map((item) => ({
          auditId: ctx.auditId,
          ruleId: item.ruleId,
          internalKey: item.internalKey ?? null,
          normalizedIssueKey: item.normalizedIssueKey ?? item.internalKey ?? null,
          category: item.category,
          scope: item.scope,
          severity: item.severity,
          title: item.title,
          description: item.description,
          evidence: item.evidence as object,
          affectedUrl: item.affectedUrl ?? null,
          recommendation: item.recommendation,
          scoreImpact: item.scoreImpact,
          businessImpact: item.businessImpact ?? null,
          metadata: item.metadata as object,
        })),
      });
    }

    // 3. Upsert scores
    await tx.auditScore.upsert({
      where: { auditId: ctx.auditId },
      create: { auditId: ctx.auditId, ...ctx.scores },
      update: ctx.scores,
    });

    // 4. Update parent Audit
    await tx.audit.update({
      where: { id: ctx.auditId },
      data: {
        status: ctx.status,
        progressStage:
          ctx.status === 'COMPLETED'
            ? 'completed'
            : ctx.status === 'PARTIAL'
              ? 'partial'
              : ctx.status === 'CANCELLED'
                ? 'cancelled'
                : 'failed',
        progress: 100,
        pagesScanned: ctx.pages.length,
        findingsGenerated: ctx.findings.length,
        completedAt: new Date(),
        durationMs,
        businessImpact: ctx.impact as object,
        executiveSummary: ctx.summary as object,
        telemetry: ctx.telemetry as object,
      },
    });

    // 5. Update execution AuditRun
    await tx.auditRun.update({
      where: { id: ctx.runId },
      data: {
        status: ctx.status,
        pagesFetched: ctx.pages.length,
        findingsCount: ctx.findings.length,
        durationMs,
        errorCode: ctx.errorCode ?? (ctx.status === 'FAILED' ? 'CRAWL_FAILED' : null),
        completedAt: new Date(),
      },
    });

    return true;
  });
}
