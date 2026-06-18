import { ensureDefaultTemplate } from '~~/server/utils/templates'

/**
 * POST /api/drawings/:id/modules
 *
 * Body: { name, boundary: [{x,y}, ...], templateId? }
 *
 * Creates a module instance on the drawing. Defaults to the user's "Default A1
 * Landscape" template if none provided (seeds it lazily). Computes sort_order
 * as max(existing)+1.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const id = getRouterParam(event, 'id')

  const drawing = (
    await db().query(`SELECT user_id FROM drawings WHERE id = $1`, [id])
  ).rows[0]
  if (!drawing) throw createError({ statusCode: 404, statusMessage: 'drawing not found' })
  if (drawing.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const body = await readBody<{
    name: string
    boundary: { x: number; y: number }[]
    templateId?: string
  }>(event)

  if (!body?.name) throw createError({ statusCode: 400, statusMessage: 'name required' })
  if (!Array.isArray(body.boundary) || body.boundary.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'boundary must be a polygon (>=3 points)' })
  }

  const templateId = body.templateId ?? (await ensureDefaultTemplate(user.id))

  const sortOrderRes = (
    await db().query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM module_instances WHERE drawing_id = $1`,
      [id]
    )
  ).rows[0]

  const inserted = (
    await db().query(
      `INSERT INTO module_instances
         (drawing_id, template_id, name, boundary_polygon, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, boundary_polygon AS boundary, sort_order AS "sortOrder"`,
      [id, templateId, body.name, JSON.stringify(body.boundary), sortOrderRes.next]
    )
  ).rows[0]

  return inserted
})
