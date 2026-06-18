/**
 * @module @modulecad/modules
 *
 * Core module-based plotting engine for moduleCad.
 *
 * A "Module" is a named closed boundary drawn over model space that becomes
 * a plot target. This package provides the types that describe modules and
 * templates, plus (in later phases) the engine that generates professional
 * paper-space AcDb layouts from them.
 *
 * See GUIDE.md and GLOSSARY.md in the repo root for the full definitions.
 *
 * License: GPL-3.0-or-later
 */

/** A 2D point in model-space world coordinates (WCS). */
export interface Point2 {
  x: number
  y: number
}

/**
 * A closed polygon (no need to repeat the first point at the end) defining
 * the region of model space that a module covers.
 */
export type BoundaryPolygon = Point2[]

/** Standard ISO/ANSI paper sizes understood by the templating layer. */
export type PaperSize =
  | 'A0'
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'ANSI-A'
  | 'ANSI-B'
  | 'ANSI-C'
  | 'ANSI-D'
  | 'ANSI-E'

export type Orientation = 'portrait' | 'landscape'

/**
 * Fraction of the sheet width (0..1) occupied by the zoomed viewport on the
 * left. The remainder is the right vertical stack (logos + legend + title).
 */
export interface ViewportRatio {
  /** e.g. 0.72 = left 72% is viewport, right 28% is the stack. */
  width: number
}

/** Plot margins in millimetres. */
export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

/** A slot in the right vertical stack reserved for a logotype image. */
export interface LogoSlot {
  /** Stable id for this slot within its template. */
  id: string
  /** Anchor position in millimetres from the sheet origin (bottom-left). */
  position: Point2
  /** Slot size in millimetres. */
  size: { width: number; height: number }
  /** Optional default image object key in RustFS (`logos/<hash>.<ext>`). */
  defaultImageKey?: string
}

/** A column in the legend table. */
export interface LegendColumn {
  /** Stable key within the template: 'thumbnail' | 'name' | 'count' | custom. */
  key: string
  /** Human-readable column header. */
  label: string
  /** Column width in millimetres. */
  width: number
}

/** Default filtering rules applied to legend block counts. */
export interface LegendDefaultFilters {
  /** Block name patterns (case-insensitive glob) to include; empty = all. */
  includePatterns: string[]
  /** Block name patterns to exclude; takes precedence over include. */
  excludePatterns: string[]
}

/** Definition of a single text field in the title block (e.g. "Drawn by"). */
export interface TitleFieldDef {
  key: string
  label: string
  /** Anchor in millimetres from sheet origin. */
  position: Point2
  /** Font size in millimetres. */
  fontSize: number
}

/**
 * A Module Template — a reusable sheet standard. Stored in Postgres and
 * applied to many drawings.
 */
export interface ModuleTemplate {
  id: string
  name: string
  paperSize: PaperSize
  orientation: Orientation
  viewportRatio: ViewportRatio
  margins: Margins
  titleFields: TitleFieldDef[]
  logoSlots: LogoSlot[]
  legendColumns: LegendColumn[]
  legendDefaultFilters: LegendDefaultFilters
}

/** Per-instance override of legend filters for a specific module. */
export interface LegendFilterOverrides {
  includePatterns?: string[]
  excludePatterns?: string[]
}

/** Per-instance logo override: which RustFS image fills which slot. */
export type LogoOverrides = Record<string, string>

/** Per-instance title field values keyed by TitleFieldDef.key. */
export type TitleFieldValues = Record<string, string>

/**
 * A Module Instance — a specific module drawn on a specific drawing.
 * Stored in Postgres. The generated AcDb layout lives inside the drawing
 * itself; this record holds the parameters and the linkage.
 */
export interface ModuleInstance {
  id: string
  drawingId: string
  templateId: string
  name: string
  /** Region of model space this module covers. */
  boundary: BoundaryPolygon
  /** Extra padding (mm of model space) around the boundary when zooming. */
  viewportZoomPadding: number
  legendFilterOverrides: LegendFilterOverrides
  logoOverrides: LogoOverrides
  titleFieldValues: TitleFieldValues
  /** Sort order in the plot grid. */
  sortOrder: number
}
