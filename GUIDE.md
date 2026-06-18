# GUIDE — moduleCad

Onboarding guide for agents and contributors. Maintained per `~/AGENTS.md`.

## What this is

moduleCad is an open-source web application for **module-based CAD plotting**.
It is a fork of [`mlightcad/cad-viewer`](https://github.com/mlightcad/cad-viewer)
(MIT) restructured into a multi-user, self-hosted web app. The defining
feature: a user opens a DWG, draws **modules** (named closed regions), clicks
**Plot**, and the app generates professional paper-space **AcDb layouts** —
each with a clipped zoomed viewport and a right vertical stack of logos + an
auto-counted legend table. All output is real AcDb geometry that opens in
AutoCAD.

See [`GLOSSARY.md`](./GLOSSARY.md) for term definitions and
[`UPSTREAM.md`](./UPSTREAM.md) for the fork relationship.

## Repository layout

```
moduleCad/                         (git root)
├── app/                           the fork (pnpm workspace)
│   ├── packages/                  vendored MIT upstream + our @modulecad/modules
│   │   ├── cad-viewer/            ← @mlightcad/cad-viewer (MIT, vendored)
│   │   ├── cad-simple-viewer/     ← @mlightcad/cad-simple-viewer (MIT, vendored)
│   │   ├── three-renderer/        ← @mlightcad/three-renderer (MIT, vendored)
│   │   ├── cad-pdf-plugin/        ← @mlightcad/cad-pdf-plugin (MIT, vendored)
│   │   ├── cad-svg-plugin/        ← @mlightcad/cad-svg-plugin (MIT, vendored)
│   │   ├── cad-html-plugin/       ← @mlightcad/cad-html-plugin (MIT, vendored)
│   │   ├── cad-html-exporter-cli/ ← @mlightcad/cad-html-exporter-cli (vendored)
│   │   ├── cad-viewer-example/    ← original demo (vendored)
│   │   ├── cad-simple-viewer-example/ ← original demo (vendored)
│   │   ├── examples/              ← shared example orchestration (vendored)
│   │   ├── vite-config/           ← shared vite config (vendored)
│   │   └── modules/               ★ @modulecad/modules (our core plotting engine)
│   ├── apps/
│   │   ├── web/                   ★ @modulecad/web — Nuxt 4 app shell
│   │   └── dwg-converter/         ★ GPL-3 microservice (LibreDWG)
│   ├── tools/                     release/sync scripts (from upstream)
│   ├── LICENSE                    GPL-3.0-or-later (the fork)
│   ├── LICENSES/                  upstream MIT attribution + GPL component inventory
│   ├── pnpm-workspace.yaml
│   ├── nx.json
│   └── package.json
├── sketchup/                      (empty placeholder — future)
├── docs/superpowers/specs/        design docs
├── GUIDE.md                       (this file)
├── GLOSSARY.md                    term definitions
├── CHANGELOG.md                   per Keep a Changelog
└── UPSTREAM.md                    fork relationship + sync strategy
```

★ = added by moduleCad (not in upstream).

## Architecture (service map)

```
Coolify (Traefik, Let's Encrypt HTTP-01)
  ├─ web (Nuxt 4)        SERVICE_FQDN_WEB        public
  │   - better-auth       ─► postgres (internal)
  │   - vendored viewer   ─► rustfs (internal)   SERVICE_FQDN_RUSTFS public (presigned)
  │   - modules UI        ─► dwg-converter (internal)
  ├─ rustfs               public, CORS, bind /srv/rustfs/data
  ├─ postgres             internal, named volume pgdata
  └─ dwg-converter        internal (GPL-3, LibreDWG)
```

Internal service-to-service calls use the service name on the shared Docker
network (`http://rustfs:9000`, `http://dwg-converter:8080`, `postgres:5432`).
Browsers talk to RustFS only via presigned URLs against its public FQDN.

## License boundaries

- **Whole fork:** GPL-3.0-or-later (`app/LICENSE`).
- **Vendored upstream packages** (`packages/cad-viewer`, `three-renderer`,
  `data-model` consumer, etc.): MIT origin, preserved in
  `app/LICENSES/MIT-upstream.txt`. MIT is compatible with GPL-3.
- **DWG read/write path:** GPL-3 (`@mlightcad/libredwg-*`) and GPL-2
  (`@mlightcad/libdxfrw-*`). Run in web workers (upstream pattern) for the
  in-browser parse, and in the `dwg-converter` service for native conversion.
  See `app/LICENSES/GPL-3.0-components.md` for the full inventory.

## Tooling versions

- Node `>=24` (running 26.x), pnpm `>=10` (pinned to 10.33.4 via `corepack`/npm).
- Build orchestration: nx 20. Workspace: pnpm. Tests: jest.
- Viewer stack: Vue 3.4+, Three.js 0.172+, element-plus 2.12+, vue-i18n 11.
- App shell: Nuxt 4, better-auth, `@aws-sdk/client-s3` (RustFS client),
  Postgres 17.

## Development setup

```bash
# from repo root
cd app
pnpm install                 # installs the whole workspace
pnpm build                   # verifies all packages build (9 upstream + ours)
pnpm dev                     # upstream full-viewer demo app
pnpm dev:web                 # our Nuxt app (Phase 1+)
pnpm test                    # jest
```

To run the stack locally with storage + conversion:

```bash
cd app
docker compose up            # postgres + rustfs + dwg-converter
pnpm dev:web                 # the Nuxt app talks to the above
```

## Conventions

- **One implementation per construct.** If a similar shape appears twice, it's
  drift — fix it. (per `~/AGENTS.md`)
- **No agent temp data in the repo.** Scratch files, model dumps, and agent
  knowledge docs live outside the repo (`~/.agents/knowledge/`).
- **CHANGELOG.md updated at each phase.** Follow [Keep a Changelog](https://keepachangelog.com/).
- **GLOSSARY.md is canonical** for the meaning of "Module", "Plot", etc.
- **Commit messages:** conventional commits (`feat:`, `fix:`, `chore:`).

## Implementation phases

Tracked in `CHANGELOG.md` and the Unreleased section. See the spec in
`docs/superpowers/specs/` for the full phase plan.

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold: fork, restructure, docs, verify build | in progress |
| 1 | App shell + better-auth + Postgres + upload page | pending |
| 2 | RustFS storage + dwg-converter + SSE job status | pending |
| 3 | Module drawing (polyline) + Postgres `module_instances` + sidebar | pending |
| 4 | `generateModuleLayout` engine + Plot/Plot All | pending |
| 5 | SVG preview grid + reorder + right-panel controls | pending |
| 6 | PDF + DXF + DWG export | pending |
| 7 | Coolify deployment + Traefik SSE workaround + backups | pending |

## Open questions for the user

- (none currently — resolved during planning)
