/**
 * GET /api/drawings/:id — single drawing detail (used by the editor page).
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const row = (
    await db().query(
      `SELECT id, user_id, original_filename AS "originalFilename",
              format, status, created_at AS "createdAt"
         FROM drawings WHERE id = $1`,
      [id]
    )
  ).rows[0]

  if (!row) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (row.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  return row
})
