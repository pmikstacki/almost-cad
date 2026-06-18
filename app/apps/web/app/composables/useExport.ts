/**
 * Export composable — produces DXF (client-side) then coordinates with the
 * server to also produce DWG (via the converter) and PDF (via cad-pdf-plugin).
 *
 * The AcDbDatabase lives in the browser (the viewer parsed the DXF into it,
 * and the modules engine added layouts to it). So:
 *   - DXF serialization happens here (db.dxfOut()).
 *   - The DXF bytes are POSTed to /api/drawings/:id/export, which uploads
 *     them to RustFS and triggers DWG conversion + (Phase 6.5) PDF rendering.
 */
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'

export interface ExportResult {
  dxfUrl: string
  dwgUrl: string | null
  pdfUrl: string | null
}

export function useExport() {
  /**
   * Serialize the current AcDbDatabase (model space + all module layouts) to
   * DXF text. Returns null if the database isn't ready.
   */
  function serializeDxf(): string | null {
    const doc = AcApDocManager.instance?.curDocument
    const db = doc?.database as any
    if (!db) return null
    // dxfOut() returns the DXF as a string when no filename is passed.
    return typeof db.dxfOut === 'function' ? db.dxfOut() : null
  }

  /**
   * Full export: DXF → server → DWG (converter) + PDF (plugin).
   * `layoutNames` is the ordered list of module layouts to include in the PDF.
   */
  async function exportAll(
    drawingId: string,
    layoutNames: string[]
  ): Promise<ExportResult> {
    const dxf = serializeDxf()
    if (!dxf) throw new Error('No AcDbDatabase available to export')

    // Hand the DXF + layout order to the server. The server uploads DXF to
    // RustFS, dispatches DWG conversion, and (once cad-pdf-plugin is wired)
    // renders the PDF. Returns presigned download URLs.
    const res = await $fetch<ExportResult>(
      `/api/drawings/${drawingId}/export`,
      {
        method: 'POST',
        body: { dxf, layoutNames }
      }
    )
    return res
  }

  return { serializeDxf, exportAll }
}
