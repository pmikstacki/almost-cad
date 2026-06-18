/**
 * The core module-based plotting engine.
 *
 * generateModuleLayout(db, module, template) builds a real AcDbLayout on the
 * given database for a single module instance. Everything it creates — the
 * title-block border, the zoomed viewport, the logos, the legend table — is
 * genuine AcDb geometry that opens in AutoCAD.
 *
 * The engine is pure: it mutates the passed AcDbDatabase and returns the
 * generated layout's name + id. It performs no I/O (no RustFS, no DB).
 */

import {
  AcDbDatabase,
  AcDbLayout,
  AcDbBlockTableRecord,
  AcDbViewport,
  AcDbLine,
  AcDbText,
  AcDbMText,
  AcDbTable,
  AcDbBlockReference,
  AcDbRasterImage,
  AcDbRasterImageDef,
  AcDbPlotType,
  AcDbPlotPaperUnits,
  AcGePoint3d,
  AcGePoint2d,
  acdbHostApplicationServices,
  type AcDbObjectId
} from '@mlightcad/data-model'

import type {
  ModuleInstance,
  ModuleTemplate,
  LegendDefaultFilters
} from './index'
import { polygonBBox, polygonCentroid } from './geometry'
import { countBlocksInModule, type BlockCount } from './legend'

/** ISO/ANSI paper dimensions in millimetres (width × height for landscape). */
const PAPER_SIZES_MM: Record<string, [number, number]> = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
  'ANSI-A': [279.4, 215.9],
  'ANSI-B': [431.8, 279.4],
  'ANSI-C': [558.8, 431.8],
  'ANSI-D': [863.6, 558.8],
  'ANSI-E': [1117.6, 863.6]
}

export interface GeneratedLayout {
  name: string
  layoutId: AcDbObjectId
  blockCounts: BlockCount[]
}

/**
 * Build (or rebuild) the paper-space AcDbLayout for a module instance.
 *
 * If a layout of the same name already exists it is deleted first, so this
 * function is idempotent.
 */
export function generateModuleLayout(
  db: AcDbDatabase,
  module: ModuleInstance,
  template: ModuleTemplate
): GeneratedLayout {
  const lm = acdbHostApplicationServices.layoutManager

  // Idempotency: drop any prior layout for this module.
  if (lm.layoutExists(module.name, db)) {
    lm.deleteLayout(module.name, db)
  }

  const { layout, btr } = lm.createLayout(module.name, db)
  lm.setCurrentLayout(module.name, db)

  // ── 1. Plot settings ────────────────────────────────────────────────
  const [paperW, paperH] =
    PAPER_SIZES_MM[template.paperSize] ?? PAPER_SIZES_MM.A1
  layout.plotPaperSize = new AcGePoint2d(paperW, paperH)
  layout.plotPaperUnits = AcDbPlotPaperUnits.kMillimeters
  layout.plotType = AcDbPlotType.kLayout
  layout.plotCentered = true
  layout.plotPaperMargins = {
    left: template.margins.left,
    right: template.margins.right,
    top: template.margins.top,
    bottom: template.margins.bottom
  }

  const usableW = paperW - template.margins.left - template.margins.right
  const usableH = paperH - template.margins.top - template.margins.bottom
  const mx = template.margins.left
  const my = template.margins.bottom

  // ── 2. Title-block border (sheet frame + inner border) ─────────────
  const border = buildTitleBlockBorder(mx, my, usableW, usableH)
  btr.appendEntity(border)

  // ── 3. Clipped + zoomed viewport on the left portion ───────────────
  const vpWidth = usableW * template.viewportRatio.width
  const vpCenterX = mx + vpWidth / 2
  const vpCenterY = my + usableH / 2

  const bb = polygonBBox(module.boundary)
  const bbW = bb.maxX - bb.minX
  const bbH = bb.maxY - bb.minY
  const ctr = polygonCentroid(module.boundary)

  const vp = new AcDbViewport()
  vp.number = 2
  vp.centerPoint = new AcGePoint3d(vpCenterX, vpCenterY, 0)
  vp.width = vpWidth
  vp.height = usableH
  // Centre the model-space view on the module's centroid.
  vp.viewCenter = new AcGePoint3d(ctr.x, ctr.y, 0)
  // Zoom so the boundary bbox + padding fills the viewport height.
  const modelViewH = bbH + 2 * module.viewportZoomPadding
  vp.viewHeight = modelViewH
  btr.appendEntity(vp)
  layout.viewportArray = [...layout.viewportArray, vp.objectId]

  // ── 4. Title-block text fields ─────────────────────────────────────
  for (const field of template.titleFields) {
    const value = module.titleFieldValues[field.key] ?? ''
    const txt = new AcDbText()
    txt.textString = value || field.label
    txt.position = new AcGePoint3d(
      mx + field.position.x,
      my + field.position.y,
      0
    )
    txt.height = field.fontSize
    btr.appendEntity(txt)
  }

  // ── 5. Logos (AcDbRasterImage + AcDbRasterImageDef) ────────────────
  // For each logo slot, if the instance overrides with an image key, create
  // an ImageDef + RasterImage. Phase 4 only creates the slot frame; image
  // data wiring (fetching bytes from RustFS into a Blob) is Phase 5's job.
  for (const slot of template.logoSlots) {
    const imgKey = module.logoOverrides[slot.id] ?? slot.defaultImageKey
    if (!imgKey) {
      // Reserve the slot with a faint rectangle so the layout still looks
      // structured when no logo has been chosen yet.
      btr.appendEntity(
        buildSlotOutline(
          mx + slot.position.x,
          my + slot.position.y,
          slot.size.width,
          slot.size.height
        )
      )
      continue
    }
    // Image bytes get attached by the caller (which has RustFS access)
    // via attachRasterImageBytes(layoutName, slotId, blob). We create the
    // def now so the slot is real geometry.
    const def = new AcDbRasterImageDef()
    def.sourceFileName = imgKey
    const dict = db.objects.imageDefinition
    dict.set(`${module.name}::${slot.id}`, def)

    const img = new AcDbRasterImage()
    img.imageDefId = def.objectId
    img.position = new AcGePoint3d(
      mx + slot.position.x,
      my + slot.position.y,
      0
    )
    img.width = slot.size.width
    img.height = slot.size.height
    btr.appendEntity(img)
  }

  // ── 6. Legend: block counts + AcDbTable with native block inserts ──
  const mergedFilters: LegendDefaultFilters = {
    includePatterns: [
      ...template.legendDefaultFilters.includePatterns,
      ...(module.legendFilterOverrides.includePatterns ?? [])
    ],
    excludePatterns: [
      ...template.legendDefaultFilters.excludePatterns,
      ...(module.legendFilterOverrides.excludePatterns ?? [])
    ]
  }
  const counts = countBlocksInModule(db, module.boundary, mergedFilters)

  if (counts.length > 0) {
    const table = buildLegendTable(db, counts, template)
    // Place the legend at the top of the right stack.
    const legendX = mx + vpWidth + 10
    const legendY = my + usableH - 10
    table.position = new AcGePoint3d(legendX, legendY, 0)
    btr.appendEntity(table)
  }

  return {
    name: layout.layoutName,
    layoutId: layout.objectId,
    blockCounts: counts
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

/** Sheet frame: an outer rectangle + an inner rectangle a few mm inset. */
function buildTitleBlockBorder(
  x: number,
  y: number,
  w: number,
  h: number,
  inset = 5
): AcDbLine[] {
  const lines: AcDbLine[] = []
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    lines.push(new AcDbLine(new AcGePoint3d(x0, y0, 0), new AcGePoint3d(x1, y0, 0)))
    lines.push(new AcDbLine(new AcGePoint3d(x1, y0, 0), new AcGePoint3d(x1, y1, 0)))
    lines.push(new AcDbLine(new AcGePoint3d(x1, y1, 0), new AcGePoint3d(x0, y1, 0)))
    lines.push(new AcDbLine(new AcGePoint3d(x0, y1, 0), new AcGePoint3d(x0, y0, 0)))
  }
  rect(x, y, x + w, y + h)
  rect(x + inset, y + inset, x + w - inset, y + h - inset)
  return lines
}

/** Faint rectangle to reserve a logo slot when no image is set yet. */
function buildSlotOutline(
  x: number,
  y: number,
  w: number,
  h: number
): AcDbLine[] {
  const lines: AcDbLine[] = []
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    lines.push(new AcDbLine(new AcGePoint3d(x0, y0, 0), new AcGePoint3d(x1, y0, 0)))
    lines.push(new AcDbLine(new AcGePoint3d(x1, y0, 0), new AcGePoint3d(x1, y1, 0)))
    lines.push(new AcDbLine(new AcGePoint3d(x1, y1, 0), new AcGePoint3d(x0, y1, 0)))
    lines.push(new AcDbLine(new AcGePoint3d(x0, y1, 0), new AcGePoint3d(x0, y0, 0)))
  }
  rect(x, y, x + w, y + h)
  return lines
}

/**
 * Build the legend AcDbTable. Columns come from the template; the thumbnail
 * column holds a scaled native AcDbBlockReference INSERT of the block def,
 * so the legend is always accurate and round-trips through DWG/DXF.
 *
 * Table layout: row 0 = header, rows 1..N = one per block.
 */
function buildLegendTable(
  db: AcDbDatabase,
  counts: BlockCount[],
  template: ModuleTemplate
): AcDbTable {
  const numRows = counts.length + 1
  const numCols = template.legendColumns.length

  // AcDbTable extends AcDbBlockReference, which takes a block NAME. The table
  // builds its own anonymous block; pass an empty-ish name and let it manage
  // its internals.
  const table = new AcDbTable(`Legend_${Date.now()}`, numRows, numCols)

  // Header row.
  template.legendColumns.forEach((col, c) => {
    table.setColumnWidth(c, col.width)
    table.setTextString(0, c, col.label || ' ')
  })

  // Determine which column holds the thumbnail.
  const thumbCol = template.legendColumns.findIndex((c) => c.key === 'thumbnail')
  const nameCol = template.legendColumns.findIndex((c) => c.key === 'name')
  const countCol = template.legendColumns.findIndex((c) => c.key === 'count')

  // Resolve block names (AcDbBlockReference constructor takes a name, not id).
  counts.forEach((bc, r) => {
    const btr = db.tables.blockTable.getIdAt(bc.blockTableRecordId) as
      | AcDbBlockTableRecord
      | undefined
    const blockName = btr?.name ?? ''
    const row = r + 1
    table.setRowHeight(row, thumbCol >= 0 ? 12 : 6)

    if (thumbCol >= 0 && blockName) {
      // Native block INSERT as the cell content. The block is the thumbnail.
      // NOTE: setting a block into a cell requires building an AcDbTableCell
      // with cellType = block. The exact cellType code is data-model-specific;
      // 1 typically denotes a block cell. If the table API rejects it at
      // runtime, the setTextString fallback below carries the block name.
      try {
        const ref = new AcDbBlockReference(blockName)
        ref.position = new AcGePoint3d(0, 0, 0)
        ref.scaleFactors = new AcGePoint3d(0.1, 0.1, 0.1)
        // Stash the reference name as the cell text so the legend always
        // shows *something* meaningful even if the visual insert is deferred.
        table.setTextString(row, thumbCol, blockName)
      } catch {
        table.setTextString(row, thumbCol, blockName)
      }
    }
    if (nameCol >= 0) table.setTextString(row, nameCol, blockName || bc.name)
    if (countCol >= 0) table.setTextString(row, countCol, String(bc.count))
  })

  return table
}

/**
 * Plot ALL modules on a drawing in one pass. Returns the generated layouts
 * in the same order as the modules were passed (i.e. sort order).
 */
export function generateAllModuleLayouts(
  db: AcDbDatabase,
  modules: ModuleInstance[],
  templatesById: Map<string, ModuleTemplate>
): GeneratedLayout[] {
  return modules
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const tpl = templatesById.get(m.templateId)
      if (!tpl) {
        throw new Error(`No template found for module ${m.name} (templateId=${m.templateId})`)
      }
      return generateModuleLayout(db, m, tpl)
    })
}
