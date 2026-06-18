import { createHash } from 'node:crypto'

/**
 * SHA-256 of arbitrary bytes, hex-encoded. Used for content-addressed object
 * keys so identical files share storage and CDN cache entries.
 */
export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Build a content-addressed key for a source drawing.
 *   makeSourceKey(buf, 'dwg') => 'dwg/ab12...34.dwg'
 */
export function makeSourceKey(
  hash: string,
  format: 'dwg' | 'dxf'
): string {
  return `${format}/${hash}.${format}`
}

/** Key for the converted DXF produced from a DWG. */
export function makeDxfKey(hash: string): string {
  return `dxf/${hash}.dxf`
}

/** Key for a generated PDF plot bundle. */
export function makePdfKey(jobId: string): string {
  return `pdf/${jobId}.pdf`
}

/** Key for a rendered SVG preview thumbnail. */
export function makePreviewKey(hash: string): string {
  return `preview/${hash}.svg`
}

/** Key for an uploaded logotype image. */
export function makeLogoKey(hash: string, ext: string): string {
  return `logos/${hash}.${ext}`
}
