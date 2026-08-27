# LeadGuard OS V6 — Public Developer API Documentation

The LeadGuard Public Developer REST API enables external platforms, agency dashboards, and automated pipelines to queue diagnostic audits, query monitoring statuses, and retrieve immutable report snapshots programmatically.

Base URL: `https://api.leadguard.io/api/v1/public`  
API Version: `v1`  
Specification: `OpenAPI 3.1` (Interactive Swagger available at `/public/docs` and schema at `/public/openapi.json`)

---

## 1. Authentication & Headers

Authenticate API requests by passing an API key in the `Authorization` header as a Bearer token:

```http
Authorization: Bearer lg_live_abc123...
```

### Standard Request Headers
| Header | Description | Required |
|---|---|:---:|
| `Authorization` | `Bearer <API_KEY>` | **YES** |
| `Content-Type` | `application/json` (for POST bodies) | Optional |
| `Idempotency-Key` | Unique request identifier to prevent duplicate execution | Recommended for POST |

---

## 2. API Scope & Rate Limit Matrix

| Endpoint | Method | Required Scope | Rate Limit Category | Limits |
|---|---|---|---|---|
| `/audits` | `POST` | `AUDIT_RUN` | `AUDIT_RUN` | 10 req/min (Key) \| 30 req/min (Org) |
| `/audits` | `GET` | `AUDIT_READ` | `READ` | 120 req/min (Key) \| 300 req/min (Org) |
| `/audits/:id` | `GET` | `AUDIT_READ` | `READ` | 120 req/min (Key) \| 300 req/min (Org) |
| `/reports` | `GET` | `REPORT_READ` | `READ` | 120 req/min (Key) \| 300 req/min (Org) |
| `/reports/:id` | `GET` | `REPORT_READ` | `READ` | 120 req/min (Key) \| 300 req/min (Org) |
| `/monitors` | `GET` | `MONITORING_READ` | `READ` | 120 req/min (Key) \| 300 req/min (Org) |
| `/monitors/:id/status` | `GET` | `MONITORING_READ` | `READ` | 120 req/min (Key) \| 300 req/min (Org) |
| `/monitors/:id/run` | `POST` | `MONITORING_RUN` | `MONITORING_RUN` | 15 req/min (Key) \| 45 req/min (Org) |
| `/testimonials` | `GET` | *Public (Approved)* | `READ` | 120 req/min |

---

## 3. Endpoints & Examples

### 3.1 Queue a Diagnostic Audit
`POST /audits`  
Required Scope: `AUDIT_RUN`

#### Request:
```bash
curl -X POST https://api.leadguard.io/api/v1/public/audits \
  -H "Authorization: Bearer lg_live_9f83... " \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: req_audit_98234" \
  -d '{
    "url": "https://example.com"
  }'
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "c71a39f1-325b-4c28-98e3-547e33519c2a",
    "website": {
      "id": "847291a4-927a-42c1-8402-984218491823",
      "name": "example.com",
      "url": "https://example.com",
      "domain": "example.com"
    },
    "status": "QUEUED",
    "score": null,
    "createdAt": "2026-08-28T00:40:00.000Z"
  }
}
```

---

### 3.2 List Audits (Tuple Cursor Pagination)
`GET /audits?limit=20&cursor=eyJjcmVhdGVkQXQiOiIyMDI2...`  
Required Scope: `AUDIT_READ`

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "c71a39f1-325b-4c28-98e3-547e33519c2a",
        "website": {
          "id": "847291a4-927a-42c1-8402-984218491823",
          "name": "example.com",
          "url": "https://example.com",
          "domain": "example.com"
        },
        "status": "COMPLETED",
        "score": {
          "overall": 88,
          "lead": 92,
          "advertising": 85,
          "seo": 80,
          "security": 95
        },
        "createdAt": "2026-08-28T00:40:00.000Z"
      }
    ],
    "meta": {
      "limit": 20,
      "hasNextPage": true,
      "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA4LTI4VDAwOjQwOjAwLjAwMFoiLCJpZCI6ImM3MWEzOWYxLTMyNWItNGMyOC05OGUzLTU0N2UzMzUxOWMyYSJ9"
    }
  }
}
```

---

### 3.3 Trigger Monitor Check on Demand
`POST /monitors/:id/run`  
Required Scope: `MONITORING_RUN`

#### Request:
```bash
curl -X POST https://api.leadguard.io/api/v1/public/monitors/5e492b1a-824a-4a21-8254-82549281a/run \
  -H "Authorization: Bearer lg_live_9f83..." \
  -H "Idempotency-Key: check_082826"
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "jobId": "9359a3e3-49ba-4b1c-9986-96f1c9374924",
    "status": "QUEUED",
    "websiteUrl": "https://example.com"
  }
}
```

#### Conflict Response (`409 Conflict`):
When a check is already actively running without an idempotency key:
```json
{
  "success": false,
  "error": {
    "code": "MONITOR_RUN_IN_PROGRESS",
    "message": "A health check run is already in progress for this monitor."
  }
}
```

---

## 4. Standard Error Envelopes

Every error response strictly follows the LeadGuard standard error structure:

```json
{
  "success": false,
  "error": {
    "code": "SSRF_BLOCKED",
    "message": "URL validation failed: Disallowed IP: 127.0.0.1",
    "requestId": "9701b316-81a1-4f10-8fae-65ee97a39bf1"
  }
}
```

### Standard Error Codes:
- `UNAUTHORIZED`: Missing or invalid Bearer API key.
- `FORBIDDEN`: API key lacks required scope for this endpoint.
- `RATE_LIMIT_EXCEEDED`: Exceeded sliding-window quota limit.
- `SSRF_BLOCKED`: Submitted destination violates outbound network security.
- `CONCURRENT_AUDIT_LIMIT_EXCEEDED`: Organization active concurrent audit limit reached.
- `MONITOR_RUN_IN_PROGRESS`: Check already running on this monitor (HTTP 409).
- `NOT_FOUND`: Target resource does not exist or belongs to another tenant.
- `INVALID_REQUEST`: Missing required body or query parameters.
