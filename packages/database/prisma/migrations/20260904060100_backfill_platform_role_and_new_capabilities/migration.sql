-- Data-only migration (Control Plane phase). Every existing platformAdmin=true
-- user already had the full 6-capability set from the Revenue Foundation
-- phase's backfill; this grants them the 5 new capabilities this phase adds
-- (PLATFORM_VIEW, CUSTOMER_VIEW, CUSTOMER_MANAGE, AUDIT_LOG_VIEW,
-- PLATFORM_ROLE_MANAGE) plus the OWNER platformRole, so no existing admin
-- loses access to anything they could already do, and at least one user can
-- grant/revoke platform roles immediately after this migration runs.
UPDATE "User"
SET "platformRole" = 'OWNER',
    "platformCapabilities" = ARRAY[
      'FINANCE_VIEW','REFUND_ISSUE','OPERATIONS_VIEW','OPERATIONS_MANAGE',
      'CUSTOMER_360_VIEW','SECURITY_VIEW','PLATFORM_VIEW','CUSTOMER_VIEW',
      'CUSTOMER_MANAGE','AUDIT_LOG_VIEW','PLATFORM_ROLE_MANAGE'
    ]::TEXT[]
WHERE "platformAdmin" = true;
