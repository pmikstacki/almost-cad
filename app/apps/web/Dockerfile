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

# ── Stage 2: build vendored packages, then the Nuxt app ───────────────
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Re-run install in the builder so the web app's local node_modules/.bin is
# fully populated (the deps stage's hoist may not symlink nuxt locally).
RUN pnpm install --no-frozen-lockfile --filter @modulecad/web --filter @modulecad/modules

# CRITICAL: the vendored @mlightcad/* packages (cad-viewer, cad-simple-viewer,
# three-renderer, cad-pdf-plugin, etc.) ship with `exports`/`main` pointing at
# ./dist/*.js, but `dist/` is gitignored — so it does NOT exist in the checkout.
# We must build those packages so the Nuxt build can resolve them.
#
# The upstream build script is `tsc && vite build`. The `tsc` step fails in the
# container (peer deps like @mlightcad/data-model and three are hoisted by pnpm
# but not visible to tsc's strict module resolution from each package's dir).
# We only need the vite output (dist/*.js), not the type declarations — so we
# run `vite build` directly per package, which emits dist/ without type-checking.
# Order matters: three-renderer first, then simple-viewer (depends on nothing
# internal but is depended-on), then the plugins + the full viewer last.
RUN cd packages/three-renderer && pnpm exec vite build \
 && cd ../cad-simple-viewer && pnpm exec vite build \
 && cd ../cad-svg-plugin && pnpm exec vite build \
 && cd ../cad-pdf-plugin && pnpm exec vite build \
 && cd ../cad-html-plugin && pnpm exec vite build \
 && cd ../cad-viewer && pnpm exec vite build

# Build just the web app. Output lands in apps/web/.output
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
