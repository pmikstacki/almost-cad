/**
 * POST /api/uploads/presign
 *
 * Phase 1 stub — returns 501 with a clear message. The RustFS presigned-URL
 * minting pipeline lands in Phase 2 (see CHANGELOG.md / GUIDE.md).
 *
 * Contract when implemented:
 *   body: { filename, contentType, format: 'dwg'|'dxf' }
 *   returns: { uploadUrl, key, drawingId }
 *   - mints a presigned PUT URL against the public RustFS endpoint
 *   - inserts a `drawings` row with status='uploaded'
 */
export default defineEventHandler(() => {
  throw createError({
    statusCode: 501,
    statusMessage:
      'Upload pipeline not implemented yet — lands in Phase 2 (RustFS + dwg-converter)'
  })
})
