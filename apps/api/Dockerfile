# LeadGuard API — production image.
#
# Build from the REPO ROOT (this is an npm-workspaces monorepo, so the build
# context must include the root package.json/lockfile and every workspace
# @leadguard/api actually depends on):
#
#   docker build -f apps/api/Dockerfile -t leadguard-api .
#
# This image does NOT run database migrations on start — a scaled-out
# deployment with multiple replicas must not race each other running
# `prisma migrate deploy` on every container boot. Run migrations as a
# separate, one-off step (see docs/DATABASE_RESTORE_RUNBOOK.md's sibling
# migration docs) before rolling out a new image.

FROM node:22-slim AS build
WORKDIR /repo

# Prisma's query engine needs libssl to detect the correct engine binary at
# `prisma generate` time — without it, generation still "succeeds" but
# silently guesses an engine target, which can mismatch the runtime image.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Install with every workspace's package.json present so npm can resolve the
# @leadguard/* workspace links, but before copying any source (better layer
# caching — this layer only invalidates when a dependency actually changes).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/api apps/api

# Build order matters: @leadguard/api imports the *compiled* .d.ts/.js output
# of config/database/shared (each package.json points "main"/"types" at
# dist/), so those three must be built (and the Prisma client generated)
# before apps/api's own build runs.
RUN npm run db:generate --workspace @leadguard/database \
 && npm run build --workspace @leadguard/config \
 && npm run build --workspace @leadguard/database \
 && npm run build --workspace @leadguard/shared \
 && npm run build --workspace @leadguard/api \
 && npm prune --omit=dev

FROM node:22-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 1001 --create-home --shell /usr/sbin/nologin appuser

WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build --chown=appuser:appuser /repo/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /repo/package.json ./package.json
COPY --from=build --chown=appuser:appuser /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=appuser:appuser /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=appuser:appuser /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build --chown=appuser:appuser /repo/packages/database/dist ./packages/database/dist
COPY --from=build --chown=appuser:appuser /repo/packages/database/prisma ./packages/database/prisma
COPY --from=build --chown=appuser:appuser /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=appuser:appuser /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=appuser:appuser /repo/packages/config/package.json ./packages/config/package.json
COPY --from=build --chown=appuser:appuser /repo/packages/config/dist ./packages/config/dist

USER appuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
