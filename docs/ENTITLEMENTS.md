# LeadGuard OS V6 — Entitlement & Quota Enforcement Engine

The LeadGuard Entitlement Engine centrally manages feature flags, monthly usage counters, and organizational limits.

---

## 1. Centralized Capability Evaluation

All feature checks and quota verifications are routed through [`EntitlementService`](file:///home/mohit/Desktop/leadgardosv6new%20top/apps/api/src/services/entitlementService.ts):

- `canRunAudit(organizationId)`: Validates monthly audit usage counter against `plan.entitlements.auditsPerMonth`.
- `canAddWebsite(organizationId)`: Validates active website count against `plan.entitlements.websites`.
- `canUseMonitoring(organizationId)`: Checks `plan.entitlements.monitoring`.
- `canUseApiKeys(organizationId)`: Checks `plan.entitlements.apiAccess`.

---

## 2. Quota Exhaustion & Error Handling

When an organization attempts an action exceeding its quota, the API responds with `403 FORBIDDEN` and error code `PLAN_LIMIT_REACHED`:

```json
{
  "success": false,
  "error": {
    "code": "PLAN_LIMIT_REACHED",
    "message": "Monthly audit quota exhausted (3/3). Upgrade to Pro or Agency for higher limits."
  }
}
```

---

## 3. Usage Tracking Architecture

Monthly quotas are partitioned by calendar billing period (`YYYY-MM`) in the `UsageRecord` table:

```prisma
model UsageRecord {
  id             String       @id @default(uuid())
  organizationId String
  period         String       // "2026-08"
  metric         UsageMetric  // AUDITS | WEBSITES | API_REQUESTS | MONITORING
  count          Int          @default(0)
  @@unique([organizationId, period, metric])
}
```
Counters are incremented transactionally upon successful job dispatch.
