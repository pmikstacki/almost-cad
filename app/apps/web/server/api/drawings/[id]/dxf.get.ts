/**
 * GET /api/drawings/:id/dxf — returns a presigned GET URL for the drawing's
 * DXF (either the original, if the upload was DXF, or the converted file).
 *
 * The browser hands this URL to the vendored viewer's `url` prop, which fetches
 * and parses it client-side via libdxfrw (in a web worker, GPL-2).
 *
 * Returns:
 *   200 { url, status, format }
 *   409 if not ready yet (conversion still running or errored)
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const row = (
    await db().query(
      `SELECT id, user_id, format, status, dxf_key, source_key, file_hash
         FROM drawings WHERE id = $1`,
      [id]
    )
  ).rows[0]

  if (!row) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (row.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  if (row.status !== 'ready' || !row.dxf_key) {
    throw createError({
      statusCode: 409,
      statusMessage: `drawing not ready (status=${row.status})`
    })
  }

  const url = await presignGet(row.dxf_key, 3600)
  return { url, status: row.status, format: row.format, hash: row.file_hash }
})
