/**
 * DELETE /api/drawings/:id/modules/:moduleId
 *
 * Removes a module instance. Cascades nothing else — the AcDb layout, if
 * already generated, lives inside the drawing file and is unaffected.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')
  const moduleId = getRouterParam(event, 'moduleId')

  const drawing = (
    await db().query(`SELECT user_id FROM drawings WHERE id = $1`, [id])
  ).rows[0]
  if (!drawing) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (drawing.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  await db().query(
    `DELETE FROM module_instances WHERE id = $1 AND drawing_id = $2`,
    [moduleId, id]
  )
  return { ok: true }
})
