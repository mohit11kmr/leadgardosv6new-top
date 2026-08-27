-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "telemetry" JSONB;

-- AlterTable
ALTER TABLE "AuditFinding" ADD COLUMN     "internalKey" TEXT,
ADD COLUMN     "normalizedIssueKey" TEXT;

-- AlterTable
ALTER TABLE "AuditRun" ADD COLUMN     "durationMs" INTEGER;

-- CreateIndex
CREATE INDEX "Audit_websiteId_status_idx" ON "Audit"("websiteId", "status");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_category_idx" ON "AuditFinding"("auditId", "category");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_normalizedIssueKey_idx" ON "AuditFinding"("auditId", "normalizedIssueKey");
