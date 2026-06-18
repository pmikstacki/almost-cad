/**
 * Geometry helpers for the modules engine.
 *
 * Pure functions, no AcDb dependency — testable in isolation.
 */
import type { BoundaryPolygon, Point2 } from './index'

/** Axis-aligned bounding box of a polygon. */
export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function polygonBBox(poly: BoundaryPolygon): BBox {
  if (poly.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function polygonCentroid(poly: BoundaryPolygon): Point2 {
  // Area-weighted centroid for a closed polygon.
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]
    const p1 = poly[(i + 1) % poly.length]
    const cross = p0.x * p1.y - p1.x * p0.y
    a += cross
    cx += (p0.x + p1.x) * cross
    cy += (p0.y + p1.y) * cross
  }
  a *= 0.5
  if (Math.abs(a) < 1e-9) {
    // Degenerate: fall back to the bbox center.
    const bb = polygonBBox(poly)
    return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** Ray-casting point-in-polygon test. `poly` need not repeat the first point. */
export function pointInPolygon(pt: Point2, poly: BoundaryPolygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Pattern matching for legend block-name filters (case-insensitive glob). */
export function matchGlob(name: string, pattern: string): boolean {
  // Translate a glob to a RegExp. Supports * and ?.
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
    'i'
  )
  return re.test(name)
}

/** Apply include/exclude glob filters to a list of block names. */
export function filterBlockNames(
  names: string[],
  filters: { includePatterns: string[]; excludePatterns: string[] }
): string[] {
  return names.filter((n) => {
    const excluded = filters.excludePatterns.some((p) => matchGlob(n, p))
    if (excluded) return false
    if (filters.includePatterns.length === 0) return true
    return filters.includePatterns.some((p) => matchGlob(n, p))
  })
}
