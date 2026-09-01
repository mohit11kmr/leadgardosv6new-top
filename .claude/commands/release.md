---
description: Assemble a release-readiness report for LeadGuard OS V6. Never pushes, force-pushes, creates a PR, or deploys.
---

Assemble a release-readiness report for LeadGuard OS V6, following `.claude/skills/release/SKILL.md` and the `release-engineer` agent.

1. **INSPECT** — `git status --short`, current branch, recent commits.
2. Run `npm run typecheck --workspaces`, `npm run lint --workspaces`, `npm run build --workspaces`, `npx vitest run` — actual output, not assumed.
3. **VERIFY** — is E2E needed for this release's changed areas? If so, run it (`/e2e`) — CI does not run it automatically. Check `.env.example` vs `packages/config/src/index.ts` for any new required env var not yet documented. Check `npm audit --omit=dev` for new findings.
4. **REPORT** — using the Phase 0 "Final Report" shape (repo/branch, git status, changed/added/preserved, tests pass/fail/not-run, security tooling status, remaining gaps, ready-for-next-phase yes/no).

Do not push, force-push, create a PR, or run any deploy command — those require the user's explicit request in this conversation, and are executed by the main session, not this command.
