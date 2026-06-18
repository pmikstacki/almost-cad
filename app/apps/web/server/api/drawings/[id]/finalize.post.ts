/**
 * POST /api/drawings/:id/finalize
 *
 * Phase 1 stub — returns 501. Phase 2 implements:
 *   - verifies the presigned upload landed in RustFS (HEAD the object)
 *   - marks the drawing status='processing'
 *   - kicks off dwg-converter (for DWG → DXF) and streams SSE progress
 */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 501,
    statusMessage:
      'Finalize not implemented yet — lands in Phase 2 (RustFS + dwg-converter)'
  })
})
