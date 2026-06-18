# Multi-stage build for @modulecad/web (Nuxt 4).
#
# The compose build context is the repo root (app/), so paths below are
# relative to that. We copy the whole workspace because the web app depends
# on the vendored @mlightcad/* workspace packages AND @modulecad/modules.

# ── Stage 1: install all workspace deps ───────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
# Copy workspace manifests first for better layer caching.
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/dwg-converter/package.json ./apps/dwg-converter/
COPY packages/modules/package.json ./packages/modules/
# Vendored upstream package.json files (needed for workspace resolution).
COPY packages ./packages
RUN pnpm install --no-frozen-lockfile

# ── Stage 2: build the Nuxt app ───────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Re-run install in the builder so the web app's local node_modules/.bin is
# fully populated (the deps stage's hoist may not symlink nuxt locally).
RUN pnpm install --no-frozen-lockfile --filter @modulecad/web --filter @modulecad/modules

# The vendored @mlightcad/* packages ship with exports/main pointing at
# ./dist/*.js. Rather than rebuild them in the container (their `tsc` step
# fails on hoisted peer deps, and per-package vite builds hit module-resolution
# differences vs local), we COMMIT the built dist/ artifacts to the repo for
# this fork. They're force-added past .gitignore. So dist/ is already present
# in the COPY . . above and no upstream build step is needed here.

# Build the web app. Output lands in apps/web/.output
WORKDIR /app/apps/web
RUN pnpm exec nuxt build

# ── Stage 3: minimal runtime ──────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Nuxt outputs a self-contained Nitro server bundle.
COPY --from=builder /app/apps/web/.output ./.output
# wget for the healthcheck (busybox wget is present on alpine; ensure it).
RUN apk add --no-cache wget
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", ".output/server/index.mjs"]
