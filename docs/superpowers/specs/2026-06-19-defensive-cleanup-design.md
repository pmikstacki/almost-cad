# Defensive-code cleanup — replace upstream-API guesswork with verified code

**Date:** 2026-06-19
**Status:** Approved (user signed off on full plan)
**Scope:** Four scaffolded-but-defensive sites identified at end of Phase 7.

## Motivation

Four pieces of the Phase 3–7 code were written defensively against an
upstream API that was never actually read — method names were guessed,
fallback shapes were probed, and one path (PDF) targets symbols that do
not exist. Reading the vendored upstream source in
`app/packages/**/src` and the installed `@mlightcad/data-model@1.9.5`
type definitions turned three of the four from "unknown" into
**confirmed answers**, which makes the cleanup concrete rather than
exploratory.

The fourth (PDF multi-layout export) has no viable path through the
vendored plugin — the plugin renders model space only and downloads via
the browser. Per user decision, **PDF is dropped** for now; DXF + DWG
remain the round-trippable deliverables.

## Findings (verified against vendored source)

| Item | Was (defensive) | Actually |
|---|---|---|
| `screenToWcs` | tries `screenToWcs` / `screenToWorld` / `convertScreenToWcs` | `AcApDocManager.instance.curView.screenToWorld(point)`; `point` is canvas-local via the public `viewportToCanvas({x,y})` helper (`AcTrView2d.ts:795`, `AcEdBaseView.ts:836`). The other two names do not exist. |
| Pixel tolerance | reads `view.height` assuming it is WCS height | `view.height` is **canvas pixels** (`AcEdBaseView.ts:803`). Derive WCS tolerance from the projection itself. |
| Legend block cell | instantiates a detached `AcDbBlockReference` + `setTextString` name fallback | `cellType` codes: `1` = text, `2` = block (`AcDbTable.js:725,745,753`). A block cell is set via `table.setCell(idx, { cellType: 2, blockTableRecordId, blockScale, textHeight, attachmentPoint })`. The detached `AcDbBlockReference` is a dead object — the visual insert is guaranteed not to render. |
| PDF export | probes `(plugin as any).AcPdfPlugin ?? .default ?? .PdfExporter` | None of those symbols exist. `AcApPdfConvertor.convert(context)` iterates **model space only** (`AcApPdfConvertor.ts:32`) and calls `jsPDF.save()` (browser download). No layout support, no byte output. → dropped. |
| RustFS health | `TODO Phase 7` | `HeadBucketCommand` / `ListBucketsCommand` already available via the AWS SDK client in `storage.ts`. Use S3 as the liveness proxy. |

## Design

### 1. `screenToWcs` → verified `screenToWorld`

**File:** `app/apps/web/app/pages/drawings/[id].vue` (~lines 286–339)

Replace the triple-fallback `screenToWcs` and the buggy `wcsPixelTolerance`
(which reads `view.height` as WCS height — it is canvas pixels) with:

```ts
function screenToWcs(ev: MouseEvent): { x: number; y: number } | null {
  const view = AcApDocManager.instance.curView
  if (!view) return null
  // viewportToCanvas is the upstream public helper: clientX/Y → canvas-local.
  const p = view.viewportToCanvas({ x: ev.clientX, y: ev.clientY })
  const wcs = view.screenToWorld(p)
  return { x: wcs.x, y: wcs.y }
}

// Pixel tolerance in WCS, derived from the real projection (no private height):
function wcsPixelTolerance(px = 6): number {
  const view = AcApDocManager.instance.curView
  if (!view) return 1
  const a = view.screenToWorld({ x: 0, y: 0 })
  const b = view.screenToWorld({ x: 0, y: px })
  return Math.abs(b.y - a.y) || 1
}
```

- Removes all `as any`, the three-way method probe, and the blanket
  `catch { return null }` that hid programmer errors. A null guard on
  `curView` (null before the document loads) remains.
- `onCanvasClick` and the polygon-close-near-first logic are unchanged.

**Verification — jest spec** (mirrors
`app/packages/cad-simple-viewer/__tests__/AcApMTextCmd.spec.ts`):

Add `app/apps/web/app/pages/drawings/__tests__/screenToWcs.spec.ts`
that stubs `AcApDocManager.instance.curView` with deterministic
`viewportToCanvas` / `screenToWorld` implementations and asserts:

- A click at canvas-local (100, 100) maps to the stubbed WCS point.
- `wcsPixelTolerance(6)` returns the expected WCS delta for 6px.
- Both return `null` / `1` when `curView` is null.

This is the "tested against the real contract" the original code lacked.

### 2. Legend block cell → real `cellType: 2` path

**File:** `app/packages/modules/src/engine.ts` (~lines 292–308)

Replace the dead `new AcDbBlockReference(...)` + `setTextString` block with
the verified `setCell` contract (`AcDbTable.d.ts` `setCell`,
`AcDbTableCell` shape; cell codes from `AcDbTable.js:725,753`):

```ts
if (thumbCol >= 0 && bc.blockTableRecordId) {
  const idx = row * template.legendColumns.length + thumbCol
  table.setCell(idx, {
    cellType: 2,                      // 2 = block; 1 = text
    blockTableRecordId: bc.blockTableRecordId,
    blockScale: 0.1,
    textHeight: 3,                    // required field
    attachmentPoint: table.attachmentPoint
  })
}
```

- `bc.blockTableRecordId` is already produced by `countBlocksInModule`
  (`legend.ts:56`) — no new lookup.
- The block IS the thumbnail; the independent `name` column still
  carries the textual name, so the legend stays readable even if a
  consumer rejects an unknown BTR.
- Drop the dead `AcDbBlockReference` instantiation and its `try/catch`.

**Verification — jest spec:** refactor the table-building into a pure
`buildLegendTable(db, counts, template)` helper (no side effects on the
layout) and add
`app/packages/modules/src/__tests__/engine.legend.spec.ts`. Feed a fake
`AcDbDatabase` with one block table record and one in-boundary insert,
assert:

- `table.cell(idx).cellType === 2`
- `table.cell(idx).blockTableRecordId === fakeBtrId`
- The `name` column cell still carries the textual name (independent cell).

### 3. Drop the dead PDF path

PDF multi-layout export has no viable path through the vendored
`AcApPdfConvertor`. Remove it cleanly; do not leave a fallback that
silently returns `null`.

- **`app/apps/web/package.json`** — remove the
  `@mlightcad/cad-pdf-plugin` dependency.
- **`app/apps/web/app/pages/drawings/[id]/preview.vue`** — delete
  `renderPdfBase64()` and the `pdfUrl` branch. The export button becomes
  **"Export (DXF/DWG)"** and surfaces two download links.
- **`app/apps/web/app/composables/useExport.ts`** — remove the PDF
  mention from the header comment; `ExportResult` loses `pdfUrl`.
- **`app/apps/web/server/api/drawings/[id]/export/pdf.post.ts`** —
  delete the route.
- **`app/apps/web/pnpm-lock.yaml`** — regenerated by `pnpm install`
  after removing the dep.
- **CHANGELOG / GUIDE / DEPLOY** — record PDF as deferred to a future
  phase; DXF/DWG are the round-trippable deliverables.

No infrastructure is removed (DXF → DWG via dwg-converter stays intact).

### 4. RustFS healthcheck (S3 liveness proxy)

- **`app/apps/web/server/utils/storage.ts`** — add:

  ```ts
  export async function health(): Promise<boolean> {
    try {
      const { ListBucketsCommand } = await import('@aws-sdk/client-s3')
      await storage().send(new ListBucketsCommand({}))
      return true
    } catch {
      return false
    }
  }
  ```

  `ListBucketsCommand` is imported dynamically (same pattern as
  `presignGet`) to keep the cold path out of the request hot path.

- **`app/apps/web/server/api/health/get.ts`** — extend the JSON body to
  `{ db, rustfs }`, both probed with a short timeout. Return 200 only
  when both are up; 503 otherwise. DB takes precedence for the web
  container's own Coolify healthcheck semantics, but both fields are
  surfaced.

- **`docker-compose.yml`** — add a `rustfs` service healthcheck using an
  S3 HEAD via whatever HTTP client the image ships (verify `mc` /
  `curl` availability against `rustfs/rustfs:latest` during
  implementation; fall back to a TCP probe if neither is present). The
  app-level `/api/health` probe is the source of truth regardless.

- **`DEPLOY.md`** — fill the rustfs row in the healthchecks table and
  remove the "TODO Phase 7" comment.

## Testing strategy

| Change | Test |
|---|---|
| `screenToWcs` + `wcsPixelTolerance` | jest spec with a stubbed `curView` |
| Legend `cellType: 2` | jest spec against a fake `AcDbDatabase` + extracted `buildLegendTable` helper |
| PDF removal | `pnpm --filter @modulecad/web build` must still compile; route disappears from the build manifest |
| RustFS `health()` | jest spec stubbing `storage().send` to resolve / reject |

All four changes also pass `pnpm build` for the whole workspace and
`docker compose config --quiet`.

## Out of scope

- Real DWG round-trip fixtures (the user flagged having none in this
  environment). The jest specs test against the *contract* defined by
  the vendored types, which is the next-best verification and is what
  was missing. True DWG round-trip testing is a separate fixture effort.
- A real multi-layout PDF exporter (deferred to its own phase).
- Any change to the DXF → DWG conversion pipeline.

## Files touched

```
app/apps/web/app/pages/drawings/[id].vue
app/apps/web/app/pages/drawings/[id]/preview.vue
app/apps/web/app/composables/useExport.ts
app/apps/web/app/pages/drawings/__tests__/screenToWcs.spec.ts   (new)
app/apps/web/server/api/health.get.ts
app/apps/web/server/api/drawings/[id]/export/pdf.post.ts        (deleted)
app/apps/web/server/utils/storage.ts
app/apps/web/package.json
app/packages/modules/src/engine.ts
app/packages/modules/src/__tests__/engine.legend.spec.ts        (new)
app/docker-compose.yml
app/DEPLOY.md
CHANGELOG.md
GUIDE.md
```
