import { randomUUID } from 'node:crypto'

/**
 * POST /api/uploads/presign
 *
 * Body: { filename, contentType, format: 'dwg'|'dxf' }
 * Returns: { uploadUrl, key, drawingId }
 *
 * Flow:
 *   1. Mint a presigned PUT URL for a temp key under uploads/<uuid>/<filename>.
 *   2. Insert a drawings row with status='uploaded' (the object isn't there
 *      yet, but we record intent so finalize knows where to look).
 *
 * The browser then PUTs the file directly to RustFS via the presigned URL,
 * bypassing the Nuxt server entirely (no body-size limit issues).
 *
 * Finalize (next step) HEADs the object, computes its SHA-256, copies it to a
 * content-addressed key (`dwg/<hash>.dwg`), and kicks off conversion.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    filename: string
    contentType: string
    format: 'dwg' | 'dxf'
  }>(event)

  if (!body?.filename || !body?.format) {
    throw createError({ statusCode: 400, statusMessage: 'filename and format required' })
  }
  if (body.format !== 'dwg' && body.format !== 'dxf') {
    throw createError({ statusCode: 400, statusMessage: 'format must be dwg or dxf' })
  }

  const user = event.context.user
  const drawingId = randomUUID()
  const tempKey = `uploads/${drawingId}/${body.filename}`

  const uploadUrl = await presignPut(tempKey, {
    contentType: body.contentType ?? 'application/octet-stream'
  })

  await db().query(
    `INSERT INTO drawings (id, user_id, original_filename, format, status, source_key)
     VALUES ($1, $2, $3, $4, 'uploaded', $5)`,
    [drawingId, user.id, body.filename, body.format, tempKey]
  )

  return { uploadUrl, key: tempKey, drawingId }
})
