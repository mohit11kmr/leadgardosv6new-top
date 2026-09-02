# LeadGuard Worker — production image.
#
# apps/worker/src/audit/renderedFetch.ts launches a real headless Chromium via
# `playwright-core` (chromium.launch()), so this image is built from
# Microsoft's official Playwright image, which ships the exact browser
# binaries + OS-level dependencies (fonts, libnss3, etc.) a bare node:*-slim
# image does not have. Its tag is pinned to match the installed
# playwright-core version — keep them in lockstep on every dependency bump
# (see https://playwright.dev/docs/docker: "use the Docker image version that
# matches your Playwright version").
#
# Build from the REPO ROOT:
#   docker build -f apps/worker/Dockerfile -t leadguard-worker .
#
# Run with `docker run --init ...` (or your orchestrator's equivalent, e.g.
# Kubernetes' default PID-1 reaping) — the worker launches and closes a
# Chromium subprocess per rendered-fetch job, and an init process is what
# reaps those child processes if one is ever orphaned. worker.ts's own
# SIGTERM/SIGINT handlers already drain BullMQ jobs gracefully.

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/worker apps/worker

RUN npm run db:generate --workspace @leadguard/database \
 && npm run build --workspace @leadguard/config \
 && npm run build --workspace @leadguard/database \
 && npm run build --workspace @leadguard/shared \
 && npm run build --workspace @leadguard/worker \
 && npm prune --omit=dev

FROM mcr.microsoft.com/playwright:v1.62.1-noble AS runtime
# No --uid: the Playwright base image already reserves low UIDs (e.g. 1001
# for its own pwuser) — let useradd assign the next free one instead of
# guessing and colliding with it.
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
 && mkdir -p /repo && chown appuser:appuser /repo

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build --chown=appuser:appuser /repo/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /repo/package.json ./package.json
COPY --from=build --chown=appuser:appuser /repo/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=appuser:appuser /repo/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=appuser:appuser /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build --chown=appuser:appuser /repo/packages/database/dist ./packages/database/dist
COPY --from=build --chown=appuser:appuser /repo/packages/database/prisma ./packages/database/prisma
COPY --from=build --chown=appuser:appuser /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=appuser:appuser /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=appuser:appuser /repo/packages/config/package.json ./packages/config/package.json
COPY --from=build --chown=appuser:appuser /repo/packages/config/dist ./packages/config/dist

USER appuser

# No HTTP surface, so no HEALTHCHECK URL — health is "is the process alive",
# which the container runtime already tracks without a custom probe.

CMD ["node", "apps/worker/dist/worker.js"]
