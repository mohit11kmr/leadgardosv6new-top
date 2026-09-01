---
name: frontend
description: Conventions for apps/web (React 19 + Vite + TanStack Query) in LeadGuard OS V6. Use when adding or changing a page, component, or data-fetching hook.
---

# Frontend (apps/web)

## Purpose
Keep new UI work consistent with the existing design system and data-fetching pattern, and never introduce data that isn't real.

## When to use
Adding/changing a page (`apps/web/src/features/*`), a shared component (`apps/web/src/components/ui/*`), or a data hook (`apps/web/src/hooks/*`).

## Repository-specific rules
- Read `.agents/skills/leadguard-ui-system/SKILL.md`, `leadguard-backend-first-ui/SKILL.md`, `leadguard-no-fake-data/SKILL.md`, and `leadguard-ux-review/SKILL.md` first — they are the product-level design/UX contract for this repo and are not duplicated here.
- Data fetching goes through TanStack Query hooks in `apps/web/src/hooks/*`, calling the typed client in `apps/web/src/api/*` — never `fetch()` directly in a component.
- The API client (`apps/web/src/api/client.ts`) stores the access token in `localStorage` and handles silent refresh via the HttpOnly refresh cookie already — reuse it, don't build a parallel auth mechanism.
- `apps/web` must never import `@leadguard/database`, `@prisma/client`, or anything from `apps/api`/`apps/worker` — see the `architecture` skill.
- No fabricated numbers, testimonials, or "X users online" style content — every rendered figure must come from a real API payload. If a number is a projection/estimate, label it explicitly (e.g. "Estimated").

## Workflow
1. Backend-first: confirm the API endpoint and its response shape actually exist (`apps/api/src/routes.ts` + the relevant service) before writing UI for it — see `leadguard-backend-first-ui/SKILL.md`'s 8-step protocol.
2. Build the loading, empty, and error states explicitly — don't ship a screen that only handles the happy path.
3. Reuse existing primitives in `components/ui/` before adding a new one.

## Verification requirements
- `npm run typecheck --workspace @leadguard/web` clean.
- `npm run build --workspace @leadguard/web` produces a clean Vite build.
- Actually run the feature in a browser (see the `browser-testing` skill) — typecheck passing is not proof the UI works.

## Failure conditions
- A screen showing a hardcoded/plausible-looking number that isn't wired to a real API field is a `no-fake-data` violation — fix before merging, not after.
