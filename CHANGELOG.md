# Changelog

All notable changes to moduleCad are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once 1.0.0 ships. Until then, `0.x` increments track phases.

## [Unreleased]

### Added — Phase 0: Scaffold

- Forked `mlightcad/cad-viewer` (MIT) into `app/` as the base; removed the
  nested `.git` so the fork is part of one parent repo.
- Renamed the workspace root package to `modulecad` (private, GPL-3.0-or-later).
- Extended `app/pnpm-workspace.yaml` to include `apps/*` alongside `packages/*`.
- Created `app/packages/modules/` (`@modulecad/modules`) — the core
  module-based plotting engine. Initial commit defines the domain types
  (`ModuleTemplate`, `ModuleInstance`, `BoundaryPolygon`, `LogoSlot`,
  `LegendColumn`, etc.) consumed by later phases.
- Created `app/apps/web/` and `app/apps/dwg-converter/` workspace slots
  (populated in Phases 1 and 2).
- Added repository-root docs per `~/AGENTS.md`:
  - `GUIDE.md` — onboarding, architecture, dev setup, license boundaries.
  - `GLOSSARY.md` — canonical definitions for Module, Plot, Layout,
    Right Vertical Stack, Block Count, etc.
  - `UPSTREAM.md` — fork relationship and sync strategy.
  - `CHANGELOG.md` (this file).
- Added `app/LICENSES/` with `MIT-upstream.txt` (preserves the upstream MIT
  notice) and `GPL-3.0-components.md` (inventory of GPL-licensed DWG
  components and their usage boundaries).

### Changed

- `app/LICENSE` switched from MIT to GPL-3.0-or-later for the fork as a
  whole. Upstream MIT attribution preserved in `app/LICENSES/MIT-upstream.txt`.

### Verified

- `pnpm install` resolves the full workspace (upstream + new packages).
- `pnpm build` builds all 9 upstream projects successfully
  (`NX Successfully ran target build for 9 projects`).

### Added — Phase 1: App shell + auth

- Scaffolded `@modulecad/web` (Nuxt 4) at `app/apps/web/` with `nuxt.config.ts`
  exposing a `runtimeConfig` for DATABASE_URL, BETTER_AUTH_SECRET, RustFS
  endpoints/keys/bucket, and the dwg-converter URL. Public config exposes the
  browser-facing RustFS endpoint for presigned uploads.
- Wired **better-auth** (`server/utils/auth.ts`) on PostgreSQL with server-side
  cookie sessions (7-day expiry, daily refresh, 5-min cookie cache).
  Email/password enabled; email verification, 2FA, and OAuth deferred to a
  later sub-phase (flagged in code). Pinned to `^1.2.0` to avoid
  CVE-2026-41427.
- Mounted the better-auth handler as Nitro catch-all routes
  (`server/api/auth/[...all].{get,post}.ts`).
- Added `server/middleware/01.api-auth.ts` that protects all `/api/*` routes
  except `/api/auth/*` and `/api/health`; sets `event.context.user` for
  downstream handlers.
- Added `GET /api/health` (Coolify healthcheck target) — returns 200 with DB
  `up`, or 503 if Postgres is unreachable.
- Added `GET /api/drawings` (list the signed-in user's drawings).
- Added Phase 2 stubs returning 501 with clear messages:
  `POST /api/uploads/presign` and `POST /api/drawings/:id/finalize`.
- Added the client surface: `app/app.vue`, `default.vue` layout with topbar,
  `useAuth()` composable (better-auth client + reactive session), pages
  (`index`, `login`, `register`, `dashboard`), and an `UploadButton` component
  wired to the Phase 2 presign contract.
- Added the DB migration `database/migrations/0001_init.sql` covering the
  better-auth tables (user/session/account/verification) and moduleCad app
  tables (drawings, module_templates, module_instances) with the JSONB columns
  mirroring the `@modulecad/modules` types.

### Verified (Phase 1)

- `pnpm install` resolves the whole workspace including Nuxt 4, better-auth,
  `pg`, and the AWS S3 client.
- `pnpm --filter @modulecad/web build` compiles the Nuxt app cleanly: all
  Nitro routes emitted, better-auth client bundled, pages rendered
  (total 4.99 MB / 1.31 MB gzip).

## [0.0.0] — pre-fork baseline

Upstream `mlightcad/cad-viewer` @ HEAD of `main` (2026-06-18), MIT-licensed.
