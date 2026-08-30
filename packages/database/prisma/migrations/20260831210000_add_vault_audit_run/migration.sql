-- CreateEnum
CREATE TYPE "VaultRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VaultRunMode" AS ENUM ('STANDARD', 'RETEST');

-- CreateTable
CREATE TABLE "VaultAuditRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "mode" "VaultRunMode" NOT NULL DEFAULT 'STANDARD',
    "status" "VaultRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerSource" TEXT NOT NULL DEFAULT 'api',
    "triggeredBy" TEXT,
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "pagesFailed" INTEGER NOT NULL DEFAULT 0,
    "findingsCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "cancelledAt" TIMESTAMP(3),
    "retestedFindings" INTEGER NOT NULL DEFAULT 0,
    "fixedFindings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultAuditRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "VaultAuditFinding" ADD COLUMN "runId" TEXT;

-- CreateIndex
CREATE INDEX "VaultAuditRun_websiteId_status_idx" ON "VaultAuditRun"("websiteId", "status");

-- CreateIndex
CREATE INDEX "VaultAuditRun_websiteId_createdAt_idx" ON "VaultAuditRun"("websiteId", "createdAt");

-- CreateIndex
CREATE INDEX "VaultAuditRun_organizationId_status_idx" ON "VaultAuditRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "VaultAuditRun_auditId_idx" ON "VaultAuditRun"("auditId");

-- CreateIndex
CREATE INDEX "VaultAuditFinding_runId_idx" ON "VaultAuditFinding"("runId");

-- AddForeignKey
ALTER TABLE "VaultAuditRun" ADD CONSTRAINT "VaultAuditRun_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditRun" ADD CONSTRAINT "VaultAuditRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "VaultAuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
