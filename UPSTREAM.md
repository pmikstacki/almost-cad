# UPSTREAM — Fork relationship with mlightcad/cad-viewer

This repository is a fork of [`mlightcad/cad-viewer`](https://github.com/mlightcad/cad-viewer).
The upstream code lives under [`app/`](./app) and retains its MIT origin (see
[`app/LICENSES/MIT-upstream.txt`](./app/LICENSES/MIT-upstream.txt)); the fork
as a whole is distributed under GPL-3.0-or-later (see [`app/LICENSE`](./app/LICENSE)).

## Upstream at a glance

| Field | Value |
|---|---|
| Upstream repo | https://github.com/mlightcad/cad-viewer |
| Default branch | `main` |
| Upstream license | MIT (Copyright (c) 2026 mlightcad) |
| Fork point | HEAD of `main` as of 2026-06-18 |
| Author | MLight Lee <mlight.lee@outlook.com> |

## What we kept from upstream

- `packages/cad-viewer` — the full Vue 3 viewer/editor component (MIT)
- `packages/cad-simple-viewer` — the headless document/editor layer (MIT)
- `packages/three-renderer` — the Three.js AcGi renderer (MIT)
- `packages/cad-pdf-plugin`, `packages/cad-svg-plugin`, `packages/cad-html-plugin` — export plugins (MIT)
- `packages/cad-viewer-example`, `packages/cad-simple-viewer-example` — original demo apps (MIT)
- `packages/vite-config`, `tools/`, nx + pnpm-workspace + tsconfig setup

The MIT-licensed `@mlightcad/data-model`, `@mlightcad/geometry-engine`,
`@mlightcad/graphic-interface`, and `@mlightcad/common` are consumed from npm
(via `app/pnpm-workspace.yaml` overrides), not vendored into the tree.

## What we added

- `app/apps/web/` — Nuxt 4 application shell (auth, storage, modules UI)
- `app/apps/dwg-converter/` — GPL-3 microservice wrapping LibreDWG
- `app/packages/modules/` — the module-based plotting engine (core IP)
- Repo-root docs: `GUIDE.md`, `GLOSSARY.md`, `CHANGELOG.md`, `UPSTREAM.md` (this file)
- `app/LICENSES/` — GPL-3.0 component inventory + upstream MIT attribution

## What we did NOT vendor

- `mlightcad/realdwg-web` — the GPL-licensed DWG parsing monorepo is NOT
  copied into this tree. Its converter packages are pulled as npm dependencies
  (`@mlightcad/libredwg-converter`, `@mlightcad/libdxfrw-converter`,
  `@mlightcad/dxf-json-converter`) and run inside web workers, preserving the
  upstream isolation pattern. Native LibreDWG runs in the separate
  `dwg-converter` service.

## Sync strategy

This is an **absorbing fork** — moduleCad is a different product (a multi-user
web app with module-based plotting), not a patch series to be PR'd upstream.
We will:

1. Periodically re-compare upstream `main` against our `packages/cad-viewer`,
   `packages/cad-simple-viewer`, `packages/three-renderer`, and the export
   plugins.
2. Cherry-pick upstream bug fixes and entity-renderer improvements that do not
   conflict with our app shell.
3. Track the comparison in `CHANGELOG.md` under a `Synced upstream` entry each
   time we pull.

There is no `upstream` git remote inside `app/` (the nested `.git` was removed
on fork). Re-syncs are done by diffing against a fresh clone of the upstream
tag in a scratch directory.
