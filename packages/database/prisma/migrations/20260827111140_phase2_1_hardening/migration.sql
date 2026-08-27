/*
  Warnings:

  - The `status` column on the `AuditRun` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "FindingScope" AS ENUM ('PAGE', 'WEBSITE', 'AUDIT');

-- AlterTable
ALTER TABLE "AuditFinding" ADD COLUMN     "scope" "FindingScope" NOT NULL DEFAULT 'PAGE';

-- AlterTable
ALTER TABLE "AuditRun" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "findingsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pagesFetched" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "status",
ADD COLUMN     "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED';

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_scope_idx" ON "AuditFinding"("auditId", "scope");
