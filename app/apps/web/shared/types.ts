/**
 * Shared types — single source of truth for backend ↔ frontend communication.
 *
 * Lives in `shared/` so Nuxt 4 auto-imports these into BOTH server routes
 * (server/api/**, server/utils/**) and client components/pages. This is the
 * contract: the server returns these shapes, the client consumes them, and a
 * type mismatch fails the build.
 *
 * License: GPL-3.0-or-later
 */

// ── Drawings ──────────────────────────────────────────────────────────

export type DrawingFormat = 'dwg' | 'dxf'

/** Lifecycle of a drawing through the pipeline. Surfaced to the client. */
export type DrawingStatus =
  | 'uploaded' // file presigned-uploaded to RustFS, not yet verified
  | 'processing' // finalize running: hashing, promoting, converting (DWG)
  | 'ready' // DXF available; viewer can load it
  | 'error' // something failed in the pipeline

export interface Drawing {
  id: string
  originalFilename: string
  format: DrawingFormat
  status: DrawingStatus
  sourceKey?: string
  dxfKey?: string
  fileHash?: string
  createdAt: string
}

// ── Modules ───────────────────────────────────────────────────────────

export interface Point2 {
  x: number
  y: number
}

export interface ModuleRow {
  id: string
  name: string
  boundary: Point2[]
  sortOrder: number
  templateId: string
  /** Present when fetched with overrides (preview page). */
  titleFieldValues?: Record<string, string>
  legendFilterOverrides?: { includePatterns?: string[]; excludePatterns?: string[] }
  logoOverrides?: Record<string, string>
}

// ── Job events (SSE) ──────────────────────────────────────────────────

export type JobStatus = 'queued' | 'converting' | 'ready' | 'error'

export interface JobEvent {
  status: JobStatus
  message?: string
  /** 0..1 progress fraction. */
  progress?: number
  ts: string
}

/** Terminal states — once reached, the SSE stream closes. */
export const TERMINAL_JOB_STATES: ReadonlySet<JobStatus> = new Set(['ready', 'error'])

// ── Auth ──────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string
  email: string
  name: string
  image?: string | null
  emailVerified: boolean
}

// ── API envelope ──────────────────────────────────────────────────────

/**
 * Normalized error shape returned by the typed API client. The server's
 * createError() produces { statusCode, statusMessage, message, data } — we
 * flatten to what the UI needs.
 */
export interface ApiError {
  statusCode: number
  message: string
  /** True for 401/403 — lets the UI redirect to login. */
  auth: boolean
}

export class ApiException extends Error {
  statusCode: number
  auth: boolean
  constructor(statusCode: number, message: string, auth = false) {
    super(message)
    this.statusCode = statusCode
    this.auth = auth
  }
}
