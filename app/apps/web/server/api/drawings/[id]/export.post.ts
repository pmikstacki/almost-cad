import { PutObjectCommand } from '@aws-sdk/client-s3'

/**
 * POST /api/drawings/:id/export
 *
 * Body: { dxf: string, layoutNames: string[] }
 *
 * Server responsibilities:
 *   1. Upload the serialized DXF (with all module layouts) to RustFS at
 *      `exports/<drawingId>/<hash>.dxf`.
 *   2. Dispatch DWG conversion (DXF → DWG) via the dwg-converter service.
 *   3. Return presigned GET URLs for DXF + DWG.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const drawing = (
    await db().query(`SELECT user_id, file_hash FROM drawings WHERE id = $1`, [id])
  ).rows[0]
  if (!drawing) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (drawing.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const body = await readBody<{ dxf: string; layoutNames: string[] }>(event)
  if (!body?.dxf) throw createError({ statusCode: 400, statusMessage: 'dxf payload required' })

  const buf = Buffer.from(body.dxf, 'utf-8')
  const hash = sha256Hex(buf)
  const bkt = useRuntimeConfig().rustfsBucket

  // Upload DXF.
  const dxfKey = `exports/${id}/${hash}.dxf`
  await storage().send(
    new PutObjectCommand({
      Bucket: bkt,
      Key: dxfKey,
      Body: buf,
      ContentType: 'application/dxf',
      // Immutable — content-addressed by hash.
      CacheControl: 'public, max-age=31536000, immutable'
    })
  )

  // Dispatch DWG conversion (async; client polls or just tries the URL).
  const dwgKey = `exports/${id}/${hash}.dwg`
  const converterUrl = useRuntimeConfig().dwgConverterUrl
  const secret = process.env.DWG_CONVERTER_SECRET ?? 'dev-converter-secret'

  // Fire-and-forget the conversion; we return the DWG URL optimistically and
  // the client can retry the download once it's ready.
  $fetch(`${converterUrl}/convert`, {
    method: 'POST',
    body: {
      inputKey: dxfKey,
      outputKey: dwgKey,
      direction: 'dxf2dwg',
      bucket: bkt
    },
    headers: { 'x-dwg-converter-secret': secret }
  }).catch(() => {
    /* surfaced via a missing DWG download on the client */
  })

  const dxfUrl = await presignGet(dxfKey, 3600)
  const dwgUrl = publicObjectUrl(dwgKey) // public; may 404 until conversion completes

  return { dxfUrl, dwgUrl }
})
