/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,idempotencyKey]` on the table `Audit` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `domain` to the `Website` table without a default value. This is not possible if the table is not empty.
  - Added the required column `normalizedUrl` to the `Website` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "AuditStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressStage" TEXT NOT NULL DEFAULT 'queued',
ADD COLUMN     "scoringVersion" TEXT NOT NULL DEFAULT 'v1';

-- AlterTable
ALTER TABLE "Website" ADD COLUMN     "domain" TEXT NOT NULL,
ADD COLUMN     "normalizedUrl" TEXT NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "Audit_organizationId_idempotencyKey_key" ON "Audit"("organizationId", "idempotencyKey");
