# LeadGuard OS V6 — Observability & Telemetry Architecture

This document specifies the metrics, structured logging formats, redaction policies, and health monitoring guidelines for LeadGuard OS V6.

---

## 1. Structured JSON Logging

All logs emitted by `apps/api` and `apps/worker` are formatted as single-line JSON objects with standard fields:

```json
{
  "timestamp": "2026-08-28T00:40:00.000Z",
  "level": "info",
  "service": "api",
  "requestId": "9701b316-81a1-4f10-8fae-65ee97a39bf1",
  "route": "/api/v1/public/audits",
  "method": "POST",
  "status": 200,
  "duration": 48
}
```

### Sensitive Data Redaction Policy
Log entries pass through `redactSensitive()` before serialization. The following fields are automatically scrubbed:
- `authorization` headers / Bearer tokens
- `password`, `passwordHash`, `passwordConfirm`
- `cookie`, `set-cookie`, `refreshToken`
- `apiKey`, `rawKey`, `secretKey`
- `signature`, `razorpay_signature`

---

## 2. Health & Readiness Probes

### Liveness Probe (`GET /health`)
- **Purpose**: Verifies that the Express process is running and accepting incoming socket connections.
- **Response**: `200 OK` `{"success": true, "data": {"status": "ok"}}`

### Readiness Probe (`GET /ready`)
- **Purpose**: Verifies that active connections to PostgreSQL (`SELECT 1`) and Redis (`redis.ping()`) are healthy.
- **Healthy Response (`200 OK`)**: `{"success": true, "data": {"status": "ready", "postgres": "ok", "redis": "ok"}}`
- **Degraded Response (`503 Service Unavailable`)**: `{"success": false, "error": {"code": "NOT_READY", "message": "Dependencies unavailable"}}`

---

## 3. Worker Queue Telemetry

BullMQ queue depths and worker states are monitored across all 14 active queues:
- `audit` / `audit-page` / `audit-finalize`
- `monitoring`
- `report` (PDF generation)
- `webhook` / `billing-webhook`
- `agency-pitch` / `agency-prospect` / `agency-competitor`
