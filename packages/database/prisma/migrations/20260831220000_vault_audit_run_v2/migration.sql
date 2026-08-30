-- AlterTable
ALTER TABLE "VaultAuditRun" ALTER COLUMN "auditId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VaultAuditFinding" DROP CONSTRAINT "VaultAuditFinding_auditId_fkey";

-- AlterTable
ALTER TABLE "VaultAuditFinding" ALTER COLUMN "auditId" DROP NOT NULL;

-- AddColumn
ALTER TABLE "VaultAuditFinding" ADD COLUMN "ignoredById" TEXT;
ALTER TABLE "VaultAuditFinding" ADD COLUMN "ignoredAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "VaultAuditFinding_ignoredById_idx" ON "VaultAuditFinding"("ignoredById");

-- AddForeignKey
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_ignoredById_fkey" FOREIGN KEY ("ignoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (re-add nullable auditId FK)
ALTER TABLE "VaultAuditFinding" ADD CONSTRAINT "VaultAuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;