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

### Added — Phase 2: Storage + DWG pipeline

- `server/utils/storage.ts` — RustFS / S3-compatible storage helper built on
  `@aws-sdk/client-s3` with `forcePathStyle: true`. Exposes `ensureBucket`,
  `presignPut`, `presignGet`, `publicObjectUrl`. Content-addressed keys are
  the caller's responsibility (see keys.ts).
- `server/utils/keys.ts` — content-addressed key builders (`dwg/<hash>.dwg`,
  `dxf/<hash>.dxf`, `pdf/<jobid>.pdf`, `preview/<hash>.svg`, `logos/<hash>.<ext>`)
  and a `sha256Hex` helper. Content addressing sidesteps CDN cache-invalidation
  problems and de-duplicates uploads.
- `server/utils/jobs.ts` — in-memory job event bus (`subscribe`/`emit`) and a
  `streamJobEvents` helper that bridges to H3's `createEventStream` for SSE.
  Phase 7 may swap for Redis Pub/Sub if multi-replica.
- `POST /api/uploads/presign` (now real) — mints a presigned PUT against the
  public RustFS endpoint, inserts a `drawings` row with status='uploaded'.
  Browser uploads directly to RustFS, bypassing Nuxt (no body-size limits).
- `POST /api/drawings/:id/finalize` (now real) — HEADs the upload, streams +
  hashes the bytes, promotes to `dwg/<hash>.dwg` (or `dxf/<hash>.dxf`),
  deletes the temp key. DXF → status='ready' immediately; DWG → dispatches to
  the dwg-converter and emits SSE progress.
- `GET /api/jobs/:id/events` — SSE stream of conversion progress; auto-closes
  on terminal status. (Requires Traefik buffering disabled — Phase 7.)
- `POST /api/jobs/:id/update` — internal callback the dwg-converter POSTs to
  when conversion completes. Authed by a shared `x-dwg-converter-secret`
  header rather than a user session; whitelisted in the auth middleware.
- `GET /api/drawings/:id/dxf` — returns a presigned GET URL for the drawing's
  DXF (original or converted) so the viewer's `url` prop can fetch it.
- `apps/dwg-converter/` — new GPL-3.0-or-later microservice. Plain `node:http`
  server wrapping the LibreDWG CLI (`dwg2dxf`, `dxf2dwg`). Endpoints:
  `GET /health`, `POST /convert { inputKey, outputKey, direction, bucket,
  callbackUrl }`. Pulls input from RustFS, converts, uploads output, POSTs
  progress to the web app's callback. Idempotent (skips if output exists).
  Framework-free to keep the GPL boundary obvious.
- `apps/web/Dockerfile` — multi-stage Nuxt build producing a self-contained
  Nitro server image with a `/api/health` healthcheck.
- `apps/dwg-converter/Dockerfile` — multi-stage image that builds LibreDWG
  from source on Debian (glibc, the well-trodden path) and bundles the
  binaries alongside a Node runtime.
- `docker-compose.yml` — Coolify-aligned four-service stack: `web` +
  `rustfs` public (`SERVICE_FQDN_*`), `postgres` + `dwg-converter` internal.
  Bind-mounts RustFS data to `/srv/rustfs/data` for independent backup.
  `pgdata` named volume for Postgres.

### Verified (Phase 2)

- `pnpm --filter @modulecad/web build` compiles cleanly with all new routes
  emitted (`api/jobs/_id/events.get.mjs`, `api/jobs/_id/update.post.mjs`,
  `api/uploads/presign.post.mjs` now real). Total 6.4 MB / 1.61 MB gzip.
- `node --check apps/dwg-converter/src/server.js` — syntax OK.
- `docker compose -f docker-compose.yml config --quiet` — structurally valid
  (only unset-env warnings, expected since Coolify injects secrets at deploy).

### Added — Phase 3: Modules drawing + storage

- `app/pages/drawings/[id].vue` — the drawing editor page. Hosts the vendored
  `MlCADViewer` (Write mode, dark theme), with a left sidebar listing the
  drawing's modules. "+ New module" enters a boundary-drawing mode that
  captures canvas clicks as model-space WCS points (via `AcApDocManager.curView`
  screen→WCS conversion) and closes the polygon on Enter or click-near-first.
  Boundary capture is silent in Phase 3 (transient overlay lands in Phase 4).
- `GET /api/drawings/:id` — single drawing detail for the editor page.
- `GET /api/drawings/:id/modules` — list a drawing's modules in sort order.
- `POST /api/drawings/:id/modules` — create a module instance. Defaults to the
  user's "Default A1 Landscape" template (seeded lazily). Computes sort_order
  as max(existing)+1. Validates boundary is a polygon (>=3 points).
- `DELETE /api/drawings/:id/modules/:moduleId` — remove a module instance.
- `server/utils/templates.ts` — `ensureDefaultTemplate(userId)` seeds a
  per-user default template matching the `@modulecad/modules` ModuleTemplate
  interface (A1 landscape, 0.72 viewport ratio, 3 title fields, 1 logo slot,
  3 legend columns [thumbnail|name|count]).
- Dashboard drawing cards are now clickable and navigate to the editor.
- `apps/web/package.json` now depends on the vendored
  `@mlightcad/cad-viewer` and `@mlightcad/cad-simple-viewer` workspace
  packages so Nuxt can resolve them at build time.

### Verified (Phase 3)

- `pnpm install` resolves the new workspace deps cleanly.
- `pnpm --filter @modulecad/web build` compiles with the vendored viewer
  bundled into the client (11.4 MB / 2.66 MB gzip — expected, since the
  editor page pulls in three-renderer + cad-simple-viewer). All new API
  routes emitted: `drawings/_id/modules/_moduleId_.delete`,
  `drawings/_id/index.get`, etc.

### Added — Phase 4: Plot generation (core IP)

- `packages/modules/src/geometry.ts` — pure geometry helpers: `polygonBBox`,
  `polygonCentroid` (area-weighted), `pointInPolygon` (ray-casting),
  `matchGlob` + `filterBlockNames` for legend include/exclude filters.
- `packages/modules/src/legend.ts` — `countBlocksInModule(db, boundary,
  filters)` iterates model space, finds `AcDbBlockReference` insertions whose
  `position` falls inside the boundary, groups by `AcDbBlockTableRecord.name`,
  applies glob filters, sorts by descending count.
- `packages/modules/src/engine.ts` — the core `generateModuleLayout(db,
  module, template)`:
  1. Idempotent: deletes any prior layout of the same name.
  2. Creates a paper-space `AcDbLayout` + its block record via
     `acdbHostApplicationServices().layoutManager.createLayout(name, db)`.
  3. Sets plot settings: paper size (ISO/ANSI mm table), margins, plotType
     kLayout, plotCentered, millimetres.
  4. Builds the title-block border (outer + inner rectangles of `AcDbLine`).
  5. Creates the `AcDbViewport` on the left portion of the sheet: `centerPoint`
     on paper, `width/height` sized to the viewport ratio, `viewCenter` on the
     module centroid, `viewHeight` = boundary bbox + padding (the zoom).
  6. Adds title-block text fields (`AcDbText`).
  7. For each logo slot with an image key, creates `AcDbRasterImageDef` +
     `AcDbRasterImage` (real geometry). Empty slots get a reserved outline.
  8. Builds the legend `AcDbTable` with one row per counted block; the
     thumbnail column references the block by name (native block insert). The
     block IS the thumbnail, so the legend is always accurate.
  - Also `generateAllModuleLayouts(db, modules, templatesById)` for bulk plotting.
- `app/composables/useModules.ts` — bridges the engine to the live
  `AcDbDatabase` held by the vendored viewer (`AcApDocManager.instance
  .curDocument.database`). Exposes `plotModule`, `plotAll`, `showLayout`.
- `GET /api/templates` — lists the user's module templates in the
  `@modulecad/modules` `ModuleTemplate` shape.
- Editor page now: loads templates, exposes per-module Plot + View actions and
  a "Plot all (N)" bulk button, switches the viewer to the generated layout
  after plotting, and calls `database.regen()` to refresh rendering.

### Verified (Phase 4)

- `pnpm --filter @modulecad/web build` compiles cleanly with the modules
  engine + the new `/api/templates` route emitted. The `@modulecad/modules`
  package is consumed as TS source via the workspace symlink and bundles into
  the client without errors.

### Added — Phase 5: Preview + reorder + right-panel controls

- `POST /api/drawings/:id/modules/reorder` — bulk reassign `sort_order` from
  an array of ids, in a single transaction.
- `PATCH /api/drawings/:id/modules/:moduleId` — merge-patch of the JSONB
  override columns (`legend_filter_overrides`, `logo_overrides`,
  `title_field_values`) plus `name` / `viewport_zoom_padding`. Dynamic UPDATE
  builder so only supplied fields are written.
- `app/pages/drawings/[id]/preview.vue` — the plot preview page:
  - **Thumbnail grid** of all plotted layouts (drag-and-drop reorderable;
    `draggable` HTML5 DnD with dragover highlighting).
  - **Save order** persists the new order via the reorder endpoint.
  - **Right panel** with per-module controls: title-field text editors, a
    legend-filter checkbox list (include/exclude block names → updates
    `legendFilterOverrides.excludePatterns`), and a **Re-plot** action that
    persists overrides then re-runs `generateModuleLayout` against the live DB.
- Editor sidebar footer now links to the preview page.

### Verified (Phase 5)

- `pnpm --filter @modulecad/web build` compiles cleanly. Preview page, reorder,
  and patch routes all emitted. Total 11.4 MB / 2.67 MB gzip.

## [0.0.0] — pre-fork baseline

Upstream `mlightcad/cad-viewer` @ HEAD of `main` (2026-06-18), MIT-licensed.
