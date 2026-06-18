/**
 * Default Module Template — seeded once per user (lazily) when they create
 * their first module. Mirrors the @modulecad/modules ModuleTemplate interface
 * for an A1 landscape sheet with a 72/28 viewport/right-stack split.
 *
 * This is the template Phase 3 modules reference. Phase 5 adds UI to edit it.
 */

export interface DefaultTemplate {
  id: string
}

export async function ensureDefaultTemplate(userId: string): Promise<string> {
  // Look for an existing user-owned default template.
  const existing = (
    await db().query(
      `SELECT id FROM module_templates WHERE user_id = $1 AND name = 'Default A1 Landscape'`,
      [userId]
    )
  ).rows[0]
  if (existing) return existing.id

  // Seed the default. JSONB columns match the @modulecad/modules types.
  const inserted = (
    await db().query(
      `INSERT INTO module_templates (
         user_id, name, paper_size, orientation, viewport_ratio, margins,
         title_fields, logo_slots, legend_columns, legend_default_filters
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        userId,
        'Default A1 Landscape',
        'A1',
        'landscape',
        JSON.stringify({ width: 0.72 }),
        JSON.stringify({ top: 10, right: 10, bottom: 10, left: 10 }),
        JSON.stringify([
          { key: 'title', label: 'Title', position: { x: 600, y: 50 }, fontSize: 6 },
          { key: 'drawn_by', label: 'Drawn by', position: { x: 600, y: 30 }, fontSize: 3 },
          { key: 'date', label: 'Date', position: { x: 600, y: 20 }, fontSize: 3 }
        ]),
        JSON.stringify([
          { id: 'logo-tl', position: { x: 760, y: 560 }, size: { width: 30, height: 30 } }
        ]),
        JSON.stringify([
          { key: 'thumbnail', label: '', width: 20 },
          { key: 'name', label: 'Block', width: 60 },
          { key: 'count', label: 'Qty', width: 20 }
        ]),
        JSON.stringify({ includePatterns: [], excludePatterns: [] })
      ]
    )
  ).rows[0]
  return inserted.id
}
