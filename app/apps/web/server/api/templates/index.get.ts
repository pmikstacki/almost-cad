/**
 * GET /api/templates — list the user's module templates, converted from the
 * JSONB columns to the @modulecad/modules ModuleTemplate shape.
 */
import type { ModuleTemplate } from '@modulecad/modules'

export default defineEventHandler(async (event) => {
  const user = event.context.user
  const rows = (
    await db().query(
      `SELECT id, name, paper_size AS "paperSize", orientation,
              viewport_ratio AS "viewportRatio", margins,
              title_fields AS "titleFields", logo_slots AS "logoSlots",
              legend_columns AS "legendColumns",
              legend_default_filters AS "legendDefaultFilters"
         FROM module_templates
         WHERE user_id = $1 OR user_id IS NULL
         ORDER BY name`,
      [user.id]
    )
  ).rows

  return rows as ModuleTemplate[]
})
