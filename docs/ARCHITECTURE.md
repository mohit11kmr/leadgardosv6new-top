# LeadGuard OS V6 — System Architecture Specification

LeadGuard OS is architected as a modular, decoupled TypeScript system with strict boundaries between presentation, business services, asynchronous workers, and persistent state.

---

## 1. System Topology

```
┌─────────────────────────────────────────────────────────┐
│              apps/web (React 19 + Vite)                │
│    - Dashboard, Audits, Monitoring, Reports, Agency     │
│    - Developer Portal, Admin, Settings, Billing        │
│    - Zero direct DB access; communicates via typed API  │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP/JSON
                             ▼
┌─────────────────────────────────────────────────────────┐
│                apps/api (Express Backend)               │
│    - Controllers, Domain Services, DTO Serializers      │
│    - Auth (HttpOnly JWT Cookies), RBAC, Quota Engine    │
│    - Rate Limiters, SSRF Gate, Public Developer API     │
└──────────────┬───────────────────────────┬──────────────┘
               │ PostgreSQL                │ Redis / BullMQ
               ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│   PostgreSQL Database     │ │   Redis Infrastructure    │
│  - Multi-Tenant Schema    │ │  - 14 BullMQ Queues       │
│  - Transactional Outbox   │ │  - Rate Limiting Windows  │
│  - Immutable Snapshots    │ │  - Distributed Locks      │
└──────────────▲────────────┘ └────────────▲──────────────┘
               │                           │
               └─────────────┬─────────────┘
                             │
┌────────────────────────────┴────────────────────────────┐
│               apps/worker (BullMQ Daemon)               │
│    - Diagnostic Audit Scanner Engine                    │
│    - Multi-Page Watchdog Health Check Engine            │
│    - PDF / White-Label Report Generator                 │
│    - Webhook Dispatcher (Manual Redirect SSRF)          │
│    - Agency Prospecting, Competitor Radar & AI Pitches  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Workspace Modular Boundaries

1. **`apps/web`**: Single-page application using React Router 7 and TanStack Query. Communicates exclusively with `apps/api` via `apiClient`. Never imports Prisma, backend models, or Node.js server packages.
2. **`apps/api`**: RESTful API server. Enforces tenant boundaries (`where: { organizationId }`), authentication, role-based authorization, rate limits, and idempotency.
3. **`apps/worker`**: Distributed background worker processing asynchronous diagnostic scans, multi-page crawling, continuous monitoring, and webhook deliveries with exponential backoff and stalled-job recovery.
4. **`packages/database`**: Prisma client and PostgreSQL schema definition.
5. **`packages/shared`**: Reusable pure TypeScript utilities (URL normalization, SSRF validator, deterministic tuple cursor pagination, scoring algorithms, and intelligence rules).
6. **`packages/config`**: Type-safe environment variable parsing with validation.
