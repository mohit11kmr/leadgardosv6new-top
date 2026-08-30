-- CreateTable
CREATE TABLE "ExpressFixLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "websiteId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "paymentId" TEXT,
    "fulfillmentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'GUEST_CHECKOUT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpressFixLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "auditId" TEXT,
    "leadId" TEXT,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixLead_paymentId_key" ON "ExpressFixLead"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixLead_fulfillmentId_key" ON "ExpressFixLead"("fulfillmentId");

-- CreateIndex
CREATE INDEX "ExpressFixLead_organizationId_createdAt_idx" ON "ExpressFixLead"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpressFixLead_auditId_idx" ON "ExpressFixLead"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressFixLead_email_auditId_key" ON "ExpressFixLead"("email", "auditId");

-- CreateIndex
CREATE INDEX "FunnelEvent_organizationId_type_createdAt_idx" ON "FunnelEvent"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_auditId_createdAt_idx" ON "FunnelEvent"("auditId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressFixLead" ADD CONSTRAINT "ExpressFixLead_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "ExpressFixFulfillment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

