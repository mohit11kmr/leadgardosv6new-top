---
name: ui-ux
description: Pointer to LeadGuard OS V6's actual UI/UX contract, which lives in .agents/skills/leadguard-*. Use for any visual/UX design decision.
---

# UI/UX

## Purpose
Avoid maintaining two competing sets of design rules. This repo already has a detailed, product-specific UI/UX contract — this skill is a pointer to it, not a replacement.

## When to use
Any screen layout, component design, copy, or UX-flow decision.

## Repository-specific rules
Read these in full before designing anything — they are the actual contract, not generic advice:
- `.agents/skills/leadguard-ui-system/SKILL.md` — design tokens, color palette, component conventions (dark-mode "cybersecurity/revenue-intelligence" visual language, CSS custom properties in `apps/web/src/styles.css`).
- `.agents/skills/leadguard-product/SKILL.md` — product identity and explicit anti-patterns (never reduce this to a generic SEO checker or generic SaaS template).
- `.agents/skills/leadguard-backend-first-ui/SKILL.md` — the 8-step protocol for grounding a new screen in real backend capability before designing it.
- `.agents/skills/leadguard-ux-review/SKILL.md` — the heuristic checklist ("what decision should the user make from this screen") for evaluating a finished screen.
- `.agents/skills/leadguard-no-fake-data/SKILL.md` — zero-fabrication policy for any number/testimonial/stat shown.

## Note on scope decisions
If the user has approved a full visual-identity change (this has happened before in this project's history — see conversation/plan history, not this file), that supersedes the *visual* tokens in `leadguard-ui-system` but not the *behavioral* rules in the other four skills above (no fake data, backend-first construction, UX heuristics, product identity boundaries) — those apply regardless of visual direction.

## Verification requirements
- See the `frontend` and `browser-testing` skills for how a UI change is actually verified (typecheck, build, live browser check) — not repeated here.

## Failure conditions
- Designing a screen before confirming the backend endpoint/data it needs actually exists (violates `leadguard-backend-first-ui`).
