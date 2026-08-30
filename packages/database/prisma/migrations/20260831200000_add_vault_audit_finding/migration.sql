-- CreateEnum
CREATE TYPE "VaultAuditStatus" AS ENUM ('OPEN', 'TRIAGED', 'FIXED', 'VERIFIED', 'VERIFIED_IGNORED');

-- CreateTable
CREATE TABLE "VaultAuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "scannerKey" TEXT NOT NULL,
    "normalizedIssueKey" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "VaultAuditStatus" NOT NULL DEFAULT 'OPEN',
    "evidence" JSONB NOT NULL,
    "affectedUrl" TEXT,
    "recommendation" TEXT NOT NULL,
    "scoreImpact" INTEGER NOT NULL,
    "cwe" TEXT,
    "cvssVector" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "ignoreReason" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultAuditFinding_websiteId_normalizedIssueKey_status_idx" ON "VaultAuditFinding"("websiteId", "normalizedIssueKey", "status");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_auditId_severity_idx" ON "VaultAuditFinding"("auditId", "severity");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_websiteId_status_idx" ON "VaultAuditFinding"("websiteId", "status");

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;