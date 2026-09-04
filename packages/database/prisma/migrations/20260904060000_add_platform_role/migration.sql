-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('OWNER', 'FINANCE', 'OPERATIONS', 'SECURITY', 'SUPPORT', 'ANALYST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "platformRole" "PlatformRole";
