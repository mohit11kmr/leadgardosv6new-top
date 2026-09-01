---
description: Audit apps/web against LeadGuard OS V6's actual UI/UX contract (design tokens, product identity, no-fake-data).
---

Audit LeadGuard OS V6's UI against its actual design contract, following `.claude/skills/ui-ux/SKILL.md` and the `.agents/skills/leadguard-*` skills it points to. Read-only.

1. **INSPECT** — `apps/web/src/styles.css` design tokens, `apps/web/src/components/ui/*` primitives, and a representative sample of feature screens.
2. **ANALYZE** — inline styles bypassing the token system; components not reusing existing primitives; screens violating `leadguard-ux-review`'s "what decision should the user make here" heuristic; anti-patterns called out in `leadguard-product` (generic SEO-checker look, generic SaaS template feel); any fabricated data.
3. **PLAN** — note fixes without implementing, unless asked to also fix.
4. **REPORT** — findings with file:line, grouped by severity, plus a screen-by-screen note on whether it was actually opened in a browser or only read from source.

If fixing is requested: verify visually in a real browser afterward (see `browser-testing` skill).
