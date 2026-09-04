-- Data-only migration (no schema change): existing platformAdmin users keep
-- exactly the access they already had (backward compatibility, per the
-- Revenue Foundation phase's explicit requirement) by being granted every
-- fine-grained capability that phase introduces. This is a one-time
-- bootstrap for the capabilities that exist as of this migration — a
-- capability added in a FUTURE migration must NOT be auto-granted this way.
UPDATE "User"
SET "platformCapabilities" = ARRAY['FINANCE_VIEW', 'REFUND_ISSUE', 'OPERATIONS_VIEW', 'OPERATIONS_MANAGE', 'CUSTOMER_360_VIEW', 'SECURITY_VIEW']::TEXT[]
WHERE "platformAdmin" = true;
