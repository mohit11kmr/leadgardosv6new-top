---
name: leadguard-api-contract
description: Enforces strict adherence to real backend API contracts, DTO types, and error states. Use whenever integrating frontend views with backend endpoints.
---

# LeadGuard OS V6 — API Contract Enforcement

The LeadGuard frontend is strictly bound to real backend contracts defined in `apps/api/src` and `packages/shared/src`. UI development must follow an authoritative backend-first protocol.

## Mandatory Pre-Implementation Inspection Checklist

Before writing or modifying any frontend component, hook, or view, the developer/agent MUST inspect:

1. **Endpoint Route Definition**: Verify HTTP verb, path params, query parameters, and middleware in `apps/api/src/routes/`.
2. **Request Schema & Validation**: Inspect Zod validators in `apps/api/src/validators/` or route handlers.
3. **Response Structure & Status Codes**: Inspect actual JSON payload structure returned on 200, 201, 400, 401, 403, 404, 409, 422, 429, and 500 responses.
4. **Shared Types & DTOs**: Verify TypeScript interfaces in `packages/shared/src/` or `apps/api/src/types/` (do NOT define duplicate ad-hoc types on the frontend if a shared type exists).
5. **Authentication & Session State**: Verify whether route requires Bearer JWT (`authenticate` middleware), API Key, guest token, or public access.
6. **RBAC & Organization Permissions**: Verify organization context (`req.organizationId`) and user role requirements (Owner, Admin, Member, Viewer, Guest).
7. **Error States & Payload Formats**: Handle backend `{ error: string, details?: ... }` or standard error structures explicitly in the UI.

---

## Strict API Prohibitions

- ❌ **Never invent API response structures**: Do not structure UI state around imaginary fields that the backend does not return.
- ❌ **Never invent backend capabilities**: If an action is not supported by a backend route/controller, do not add fake buttons or mock actions that appear functional.
- ❌ **Never silently substitute mock data for production flows**: Live dashboards, audits, and settings must connect to real endpoints. If mock fixtures are used for development/testing, they must be explicitly isolated in designated fixture files and labeled as demo fixtures.
- ❌ **Never bypass API validation**: Ensure frontend forms enforce the same validation bounds (lengths, regexes, required fields) as backend Zod schemas to avoid runtime 400 rejections.
