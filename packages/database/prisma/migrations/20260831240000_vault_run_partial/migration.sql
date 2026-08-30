-- AlterEnum: add 'PARTIAL' to VaultRunStatus
BEGIN;
ALTER TYPE "VaultRunStatus" RENAME TO "VaultRunStatus_old";
CREATE TYPE "VaultRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
ALTER TABLE "VaultAuditRun" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "VaultAuditRun" ALTER COLUMN "status" TYPE "VaultRunStatus" USING ("status"::text::"VaultRunStatus");
ALTER TABLE "VaultAuditRun" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
DROP TYPE "VaultRunStatus_old";
COMMIT;
