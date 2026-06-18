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

## [0.0.0] — pre-fork baseline

Upstream `mlightcad/cad-viewer` @ HEAD of `main` (2026-06-18), MIT-licensed.
