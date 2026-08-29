---
name: leadguard-backend-first-ui
description: Architectural workflow requiring backend validation before frontend UI authoring. Use whenever designing or constructing any new screen, modal, or interactive workflow.
---

# LeadGuard OS V6 — Backend-First UI Construction Workflow

In LeadGuard OS V6, user interface architecture must always be grounded in verified backend capabilities. Never start with standalone visual design in isolation from API contracts and data models.

## The 8-Step Backend-First Protocol

Before opening or creating frontend JSX/TSX files for a screen, follow this mandatory sequence:

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│ 1. Inspect Backend      │ ──> │ 2. Inspect API & DTOs   │ ──> │ 3. Inspect Auth & State │
│    Capabilities & DB    │     │    Request/Response     │     │    Roles & Permissions  │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
             │
             ▼
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│ 4. Inspect Data States  │ ──> │ 5. Plan User Decisions  │ ──> │ 6. Author UI Components │
│    Loading, Empty, Err  │     │    & Action Outcomes    │     │    & Connect Real API   │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
             │
             ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ 7. Browser QA Verify    │ ──> │ 8. Verify No Fake Data  │
│    Live Console/Network │     │    Evidence Provenance  │
└─────────────────────────┘     └─────────────────────────┘
```

### Detailed Sequence:

1. **Inspect Backend Capability**:
   - Verify underlying database models (`packages/database/prisma/schema.prisma`), queues (`apps/worker`), and business services (`apps/api/src/services/`).
2. **Inspect API Contracts & DTOs**:
   - Check endpoint routes (`apps/api/src/routes/`), Zod validation schemas, and TypeScript interfaces (`packages/shared/src/`).
3. **Inspect Authentication & Permissions**:
   - Check required session state, organization isolation, and user role levels.
4. **Inspect Full Data Lifecycle States**:
   - Identify what data looks like when loading (skeleton dimensions).
   - Identify what the payload looks like when zero records exist (empty state).
   - Identify error payloads returned by backend error handlers (400/401/403/404/422/429/500).
5. **Formulate User Decisions**:
   - Define what actionable decision the user executes from the screen.
6. **Author UI Components**:
   - Compose view using existing design system primitives (`apps/web/src/components/ui/`) and CSS tokens (`apps/web/src/styles.css`).
7. **Execute Browser QA Verification**:
   - Validate live network calls, console logs, and responsiveness in real browser.
8. **Audit Evidence Provenance**:
   - Ensure all rendered numbers, charts, and tables trace directly to backend API payloads.
