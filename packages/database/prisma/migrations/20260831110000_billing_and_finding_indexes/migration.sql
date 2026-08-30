-- Add supporting indexes for webhook idempotency lookups and report scoring
CREATE INDEX "BillingEvent_providerEventId_idx" ON "BillingEvent"("providerEventId");
CREATE INDEX "AuditFinding_auditId_scoreImpact_idx" ON "AuditFinding"("auditId", "scoreImpact");
