/**
 * Legend block counting — scans model space for AcDbBlockReference entities
 * whose insertion point falls inside a module boundary, and groups them by
 * block name. The result feeds the AcDbTable legend.
 */
import type {
  AcDbDatabase,
  AcDbBlockReference,
  AcDbBlockTableRecord,
  AcDbObjectId
} from '@mlightcad/data-model'
import { AcDbBlockReference } from '@mlightcad/data-model'

import type { BoundaryPolygon, LegendDefaultFilters } from './index'
import { pointInPolygon, filterBlockNames } from './geometry'

export interface BlockCount {
  /** Block name (AcDbBlockTableRecord.name). */
  name: string
  /** ObjectId of the block table record (for the legend thumbnail insert). */
  blockTableRecordId: AcDbObjectId
  count: number
}

/**
 * Count distinct block references inside `boundary`, grouped by block name.
 */
export function countBlocksInModule(
  db: AcDbDatabase,
  boundary: BoundaryPolygon,
  filters: LegendDefaultFilters
): BlockCount[] {
  const modelSpace = db.tables.blockTable.modelSpace
  const iter = modelSpace.newIterator()

  const map = new Map<string, BlockCount>()

  for (const entity of iter) {
    if (!(entity instanceof AcDbBlockReference)) continue
    const ref = entity as AcDbBlockReference
    const pos = ref.position
    const inside = pointInPolygon({ x: pos.x, y: pos.y }, boundary)
    if (!inside) continue

    const btr = ref.blockTableRecord
    if (!btr) continue
    const name = (btr as AcDbBlockTableRecord).name
    if (!name) continue

    const existing = map.get(name)
    if (existing) {
      existing.count++
    } else {
      map.set(name, {
        name,
        blockTableRecordId: (btr as AcDbBlockTableRecord).objectId,
        count: 1
      })
    }
  }

  // Apply filters then sort by descending count (most-used first).
  const filteredNames = filterBlockNames(
    [...map.keys()],
    filters
  )
  const result = filteredNames
    .map((n) => map.get(n)!)
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)

  return result
}
