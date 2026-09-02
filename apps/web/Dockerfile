# LeadGuard Web (customer + agency SPA) — production image.
#
# This is genuinely optional: apps/web is a static Vite build with no server
# runtime, so a CDN/static host (Vercel, Netlify, a Render static site, or an
# S3+CloudFront bucket) is very likely simpler than containerizing it at all.
# This Dockerfile exists for parity with api/worker when a single-provider
# container-only topology is preferred instead.
#
# Vite bakes VITE_* env vars into the static bundle AT BUILD TIME, not at
# container start — the API's public base URL must be supplied as a
# --build-arg, e.g.:
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.example.com/api/v1 \
#     -t leadguard-web .

FROM node:22-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace @leadguard/shared

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build --workspace @leadguard/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
