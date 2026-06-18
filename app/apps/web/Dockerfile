# Multi-stage build for @modulecad/web (Nuxt 4).
# Base image includes pnpm so we can install the workspace cleanly.
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/modules/package.json ./packages/modules/
# Copy only the package.json files of the upstream packages the web app may
# symlink against at build time. (The vendored viewer is consumed via the
# built artifacts / npm overrides, not source, at runtime.)
COPY packages ./packages
RUN pnpm install --frozen-lockfile || pnpm install

FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build the Nuxt app. Output lands in apps/web/.output
RUN pnpm --filter @modulecad/web build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Nuxt outputs a self-contained server bundle; copy just that.
COPY --from=builder /app/apps/web/.output ./.output
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", ".output/server/index.mjs"]
