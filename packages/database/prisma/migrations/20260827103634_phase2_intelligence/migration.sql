-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "businessImpact" JSONB,
ADD COLUMN     "executiveSummary" JSONB;

-- CreateTable
CREATE TABLE "AuditPage" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "title" TEXT,
    "contentType" TEXT,
    "headers" JSONB,
    "htmlAvailable" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER,
    "depth" INTEGER NOT NULL,
    "parentUrl" TEXT,
    "errorCode" TEXT,
    "redirectChain" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditPage_auditId_depth_idx" ON "AuditPage"("auditId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPage_auditId_url_key" ON "AuditPage"("auditId", "url");

-- AddForeignKey
ALTER TABLE "AuditPage" ADD CONSTRAINT "AuditPage_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
