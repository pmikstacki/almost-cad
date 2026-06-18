import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3'

/**
 * POST /api/drawings/:id/finalize
 *
 * After the browser PUTs the file to RustFS via the presigned URL, the client
 * calls this to:
 *   1. Verify the object exists (HEAD).
 *   2. Stream its bytes to compute SHA-256 (content addressing).
 *   3. Copy it to `dwg/<hash>.dwg` (or `dxf/<hash>.dxf`) — the canonical key.
 *   4. Delete the temp upload key.
 *   5. Update the drawings row with the hash + canonical key + status.
 *   6. Kick off conversion:
 *        - DXF: mark status='ready' immediately (viewer parses it natively).
 *        - DWG: status='processing', POST to the dwg-converter service which
 *          runs dwg2dxf and writes dxf/<hash>.dxf, then status='ready'.
 *   7. Emit job events for the SSE subscriber.
 *
 * Returns immediately with { status, jobId } — the client subscribes to
 * /api/jobs/:jobId/events for progress.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const row = (
    await db().query(
      `SELECT id, user_id, original_filename, format, source_key
         FROM drawings WHERE id = $1`,
      [id]
    )
  ).rows[0]

  if (!row) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (row.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const jobId = row.id // use drawing id as the job id for SSE
  const s3 = storage()
  const bkt = useRuntimeConfig().rustfsBucket

  // 1. Verify the upload landed.
  emit(jobId, { status: 'queued', message: 'Verifying upload', ts: now() })
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bkt, Key: row.source_key }))
  } catch {
    emit(jobId, {
      status: 'error',
      message: 'Uploaded object not found in storage',
      ts: now()
    })
    throw createError({ statusCode: 422, statusMessage: 'uploaded object not found' })
  }

  // 2. Stream + hash the bytes.
  emit(jobId, { status: 'converting', message: 'Hashing file', progress: 0.1, ts: now() })
  const getRes = await s3.send(new GetObjectCommand({ Bucket: bkt, Key: row.source_key }))
  const chunks: Buffer[] = []
  for await (const c of getRes.Body as any) chunks.push(Buffer.from(c))
  const buf = Buffer.concat(chunks)
  const hash = sha256Hex(buf)

  // 3. Promote to content-addressed key.
  const canonicalKey = makeSourceKey(hash, row.format)
  await s3.send(
    new CopyObjectCommand({
      Bucket: bkt,
      CopySource: `${bkt}/${row.source_key}`,
      Key: canonicalKey
    })
  )
  await s3.send(new DeleteObjectCommand({ Bucket: bkt, Key: row.source_key }))

  await db().query(
    `UPDATE drawings
        SET source_key = $1, file_hash = $2, status = 'processing', updated_at = NOW()
      WHERE id = $3`,
    [canonicalKey, hash, row.id]
  )

  // 4. DXF: ready immediately. DWG: ask the converter.
  if (row.format === 'dxf') {
    await db().query(
      `UPDATE drawings SET dxf_key = $1, status = 'ready', updated_at = NOW() WHERE id = $2`,
      [canonicalKey, row.id]
    )
    emit(jobId, {
      status: 'ready',
      message: 'DXF ready (parsed natively by the viewer)',
      progress: 1,
      ts: now()
    })
    return { status: 'ready', jobId }
  }

  // DWG: dispatch to the dwg-converter service (async; it calls back).
  emit(jobId, {
    status: 'converting',
    message: 'Converting DWG → DXF',
    progress: 0.3,
    ts: now()
  })

  const dxfKey = makeDxfKey(hash)
  const converterUrl = useRuntimeConfig().dwgConverterUrl
  $fetch(`${converterUrl}/convert`, {
    method: 'POST',
    body: {
      inputKey: canonicalKey,
      outputKey: dxfKey,
      direction: 'dwg2dxf',
      callbackUrl: `${useRuntimeConfig().dwgConverterUrl
        .replace('dwg-converter', 'web')}/api/jobs/${jobId}/update`.replace(':8080', ':3000'),
      bucket: bkt
    }
  }).catch((err) => {
    emit(jobId, {
      status: 'error',
      message: `Converter request failed: ${err?.message ?? err}`,
      ts: now()
    })
    db().query(`UPDATE drawings SET status = 'error', updated_at = NOW() WHERE id = $1`, [jobId])
  })

  return { status: 'processing', jobId }
})

function now(): string {
  return new Date().toISOString()
}
