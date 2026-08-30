-- DropIndex
DROP INDEX IF EXISTS "VaultAuditRun_organizationId_status_idx";

-- AlterTable
ALTER TABLE "VaultAuditRun" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VaultAuditRun_organizationId_idempotencyKey_key" ON "VaultAuditRun"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VaultAuditRun_organizationId_status_idx" ON "VaultAuditRun"("organizationId", "status");
