# LeadGuard OS V6 — UI/UX Setup Baseline

**Generated Date**: 2026-08-29  
**Phase**: Phase 0 — Tooling & Agent Workspace Setup Only  
**Repository**: [leadgardosv6new-top](https://github.com/mohit11kmr/leadgardosv6new-top)

---

## 1. Version Control & Working Tree State

| Property | Value | Notes |
| :--- | :--- | :--- |
| **Current Branch** | `main` | Up to date with `origin/main` |
| **Commit SHA** | `71cbdf17f51b6424b49b4a29e2484f144340dcb9` | `fix: harden guest scan and express fix conversion funnel` |
| **Working Tree Status** | **Modified (Unstaged User Changes Present)** | Preserved untouched in accordance with Safety Policy |

### Pre-Existing Unstaged Working Tree Changes:
1. `apps/api/src/billing/razorpayProvider.ts`: Implementation of real `fetchOrder`, `fetchPayment`, and endpoint dynamic URL binding (`${this.getBaseUrl()}`).
2. `apps/api/src/billing/types.ts`: Added `RazorpayOrder` and `RazorpayPayment` interface definitions and updated `PaymentProvider` interface.
3. `packages/config/src/index.ts`: Updated `PAYMENT_PROVIDER_MODE` enum to `['TEST', 'LIVE']`, required Razorpay secrets, and added `TRUST_PROXY` config flag.

---

## 2. Runtime & Core Toolchain Versions

| Component | Version | Details |
| :--- | :--- | :--- |
| **Node.js** | `v22.23.2` | Active runtime environment |
| **Package Manager** | `npm 10.9.8` | Monorepo workspaces (`npm@10`) configured in root `package.json` |
| **TypeScript** | `5.7.3` | Root & workspace configs (`tsconfig.base.json`, workspace `tsconfig.json`) |
| **Vite** | `6.0.7` | Bundler & Dev server for `@leadguard/web` |
| **React** | `19.0.0` | Frontend UI library with `@types/react@19.0.2` |
| **React Router** | `7.1.1` | Declarative routing in `apps/web/src/app/routes.tsx` |
| **TanStack React Query** | `5.62.0` | Client-side async state & caching (`apps/web/src/lib/queryClient.ts`) |
| **Express** | `5.1.0` | Backend API server in `apps/api/src/server.ts` |
| **Prisma ORM** | `6.2.1` | Database schema & client (`packages/database/prisma/schema.prisma`) |
| **BullMQ & ioredis** | `bullmq@5.34.0`, `ioredis@5.11.1` | Asynchronous worker & queue engine in `apps/worker` |
| **Zod** | `3.24.1` | Schema validation for config, API contracts, and requests |
| **Vitest** | `2.1.8` | Unit & integration test runner |
| **Playwright** | `1.49.1` | E2E browser automation & verification (`playwright.config.ts`) |

---

## 3. Monorepo Architecture & Workspace Structure

```
leadgardosv6new top/
├── apps/
│   ├── api/          # Express 5.1 REST API (Port 4000)
│   ├── web/          # React 19 + Vite 6 Single Page Application (Port 5173)
│   └── worker/       # BullMQ Background Diagnostic & Crawling Engine
├── packages/
│   ├── config/       # Shared environment configuration & Zod validation
│   ├── database/     # Prisma client & PostgreSQL database schema
│   └── shared/       # Cross-boundary DTOs, interfaces, and utilities
├── tests/            # Test suites (architecture, scoring, audit, integration, e2e)
├── docs/             # Technical architecture & operational runbooks
├── .agents/          # Antigravity/Gemini agent skills & MCP config
└── .opencode/        # OpenCode/Nemotron agent skills & MCP config
```

---

## 4. Design System & UI Architecture Baseline

### Design Tokens (`apps/web/src/styles.css`)
- **Theme**: Dark-mode cybersecurity & revenue intelligence aesthetic.
- **Palette**:
  - Primary Background: `--bg-app` (`#090d16`)
  - Elevated Surfaces: `--bg-surface` (`#111726`), `--bg-surface-elevated` (`#172033`), `--bg-surface-hover` (`#1e293b`)
  - Borders: `--border-color` (`#1e293b`), `--border-subtle` (`#182234`)
  - Typography: `--text-primary` (`#f8fafc`), `--text-secondary` (`#94a3b8`), `--text-muted` (`#64748b`)
  - Semantic Status: `--primary` (`#3b82f6`), `--success` (`#10b981`), `--warning` (`#f59e0b`), `--danger` (`#ef4444`), `--purple` (`#8b5cf6`)
- **Radii & Layout**: Multiples of 4/8px, `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (14px).

### Existing Component Primitives (`apps/web/src/components/ui/`)
- `Button.tsx`: Multi-variant button component (primary, secondary, outline, danger, ghost) with loading states.
- `Card.tsx` & `MetricCard.tsx`: Structured surface containers with hover states and metric displays.
- `Badge.tsx`: Semantic status tags and severity chips.
- `FindingCard.tsx`: Comprehensive diagnostic finding presentation with severity badges, category metadata, and remediation advice.
- `ScoreRing.tsx`: SVG circular progress gauge for site health scores (0–100).
- `Modal.tsx`: Accessible dialog modal overlay with scrim and dismiss triggers.
- `States.tsx`: Standardized `LoadingState`, `EmptyState`, and `ErrorState` components.
- `Tabs.tsx`: Accessible tab switcher.
- `OnboardingCard.tsx`: Guided onboarding flow card.
- `Icons.tsx`: Curated SVG icon collection.

### App Shell & Layout (`apps/web/src/components/layout/`)
- `Shell.tsx`: Main dashboard sidebar navigation, top bar, breadcrumbs, user profile, and responsive drawer.
- `OrganizationSwitcher.tsx`: Multi-tenant organization selector dropdown.

---

## 5. Playwright & E2E Verification Setup

- **Config**: `playwright.config.ts`
- **Target URL**: `http://localhost:5173`
- **Orchestration**: Automatically spins up `@leadguard/api` on port `4000` (`http://localhost:4000/health`) and `@leadguard/web` on port `5173`.
- **Test Directory**: `tests/e2e`

---

## 6. Project Safety & Guardrail Confirmation

- Product UI code was **NOT** redesigned or modified.
- No backend code or database schemas were refactored.
- No third-party UI framework replacements (e.g. Tailwind / external component libraries) were introduced.
- Pre-existing working tree modifications remain completely intact.
