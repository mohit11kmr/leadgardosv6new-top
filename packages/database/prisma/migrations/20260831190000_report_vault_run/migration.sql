-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_auditId_fkey";

-- AlterTable
ALTER TABLE "Report" ALTER COLUMN "auditId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "vaultRunId" TEXT;

-- CreateIndex
CREATE INDEX "Report_vaultRunId_idx" ON "Report"("vaultRunId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_vaultRunId_fkey" FOREIGN KEY ("vaultRunId") REFERENCES "VaultAuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
