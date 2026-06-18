import { PutObjectCommand } from '@aws-sdk/client-s3'

/**
 * POST /api/drawings/:id/export/pdf
 *
 * Body: { pdf: string (base64), layoutNames: string[] }
 *
 * The client renders the multi-page PDF via cad-pdf-plugin (which runs in the
 * browser against the live AcDbDatabase, iterating module layouts in sort
 * order). It uploads the resulting bytes here; we store them content-addressed
 * in RustFS and return a presigned download URL.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const drawing = (
    await db().query(`SELECT user_id FROM drawings WHERE id = $1`, [id])
  ).rows[0]
  if (!drawing) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (drawing.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const body = await readBody<{ pdf: string; layoutNames: string[] }>(event)
  if (!body?.pdf) throw createError({ statusCode: 400, statusMessage: 'pdf payload required' })

  const buf = Buffer.from(body.pdf, 'base64')
  const hash = sha256Hex(buf)
  const bkt = useRuntimeConfig().rustfsBucket
  const key = makePdfKey(hash)

  await storage().send(
    new PutObjectCommand({
      Bucket: bkt,
      Key: key,
      Body: buf,
      ContentType: 'application/pdf',
      CacheControl: 'public, max-age=31536000, immutable'
    })
  )

  const url = await presignGet(key, 3600)
  return { url, key }
})
