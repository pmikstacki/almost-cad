/**
 * GET /api/drawings/:id/modules — list modules for a drawing, in sort order.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  // Verify ownership.
  const drawing = (
    await db().query(`SELECT user_id FROM drawings WHERE id = $1`, [id])
  ).rows[0]
  if (!drawing) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (drawing.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const rows = (
    await db().query(
      `SELECT id, name, boundary_polygon AS boundary, sort_order AS "sortOrder"
         FROM module_instances
         WHERE drawing_id = $1
         ORDER BY sort_order ASC, created_at ASC`,
      [id]
    )
  ).rows

  return rows
})
