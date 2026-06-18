/**
 * POST /api/drawings/:id/modules/reorder
 *
 * Body: { order: string[] } — module ids in the desired sort order.
 * Reassigns sort_order 0..N to match.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const drawing = (
    await db().query(`SELECT user_id FROM drawings WHERE id = $1`, [id])
  ).rows[0]
  if (!drawing) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (drawing.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const body = await readBody<{ order: string[] }>(event)
  if (!Array.isArray(body?.order)) {
    throw createError({ statusCode: 400, statusMessage: 'order must be an array of ids' })
  }

  // Update each module's sort_order in a single transaction.
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    for (let i = 0; i < body.order.length; i++) {
      await client.query(
        `UPDATE module_instances SET sort_order = $1, updated_at = NOW()
          WHERE id = $2 AND drawing_id = $3`,
        [i, body.order[i], id]
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  return { ok: true }
})
