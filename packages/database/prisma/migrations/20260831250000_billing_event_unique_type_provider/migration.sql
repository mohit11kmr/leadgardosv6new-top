-- C5 audit fix: make (type, providerEventId) unique so concurrent webhook
-- deliveries and duplicate-payment verification are de-duplicated at the DB
-- level instead of relying on a racy read-then-write check.
CREATE UNIQUE INDEX "BillingEvent_type_providerEventId_key" ON "BillingEvent" ("type", "providerEventId");
