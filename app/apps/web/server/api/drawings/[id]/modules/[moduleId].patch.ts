/**
 * PATCH /api/drawings/:id/modules/:moduleId
 *
 * Body: partial {
 *   name?, viewportZoomPadding?,
 *   legendFilterOverrides?, logoOverrides?, titleFieldValues?
 * }
 *
 * Merges into the module instance row. Used by the preview page's right
 * panel (legend filters, logo toggles, title field editors) before re-plot.
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

  const body = await readBody<Record<string, unknown>>(event)

  // Build a dynamic UPDATE for the JSONB columns we allow patching.
  const sets: string[] = []
  const vals: unknown[] = []
  let p = 1

  if (typeof body.name === 'string') {
    sets.push(`name = $${p++}`)
    vals.push(body.name)
  }
  if (typeof body.viewportZoomPadding === 'number') {
    sets.push(`viewport_zoom_padding = $${p++}`)
    vals.push(body.viewportZoomPadding)
  }
  for (const col of [
    'legend_filter_overrides',
    'logo_overrides',
    'title_field_values'
  ] as const) {
    const key = col.replace(/_./g, (m) => m[1].toUpperCase()) as keyof typeof body
    if (body[key] !== undefined) {
      sets.push(`${col} = $${p++}`)
      vals.push(JSON.stringify(body[key]))
    }
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'no updatable fields supplied' })
  }

  sets.push(`updated_at = NOW()`)
  vals.push(moduleId, id)

  const updated = (
    await db().query(
      `UPDATE module_instances SET ${sets.join(', ')}
        WHERE id = $${p++} AND drawing_id = $${p++}
        RETURNING id, name, boundary_polygon AS boundary, sort_order AS "sortOrder",
                  legend_filter_overrides AS "legendFilterOverrides",
                  logo_overrides AS "logoOverrides",
                  title_field_values AS "titleFieldValues"`,
      vals
    )
  ).rows[0]

  if (!updated) throw createError({ statusCode: 404, statusMessage: 'module not found' })
  return updated
})
