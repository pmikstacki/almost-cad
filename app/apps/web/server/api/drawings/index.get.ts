/**
 * GET /api/drawings — list the signed-in user's drawings, newest first.
 *
 * Authed via server/middleware/01.api-auth.ts; user is on event.context.user.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const result = await db().query(
    `SELECT id, original_filename AS "originalFilename", format,
            status, source_key AS "sourceKey", created_at AS "createdAt"
       FROM drawings
       WHERE user_id = $1
       ORDER BY created_at DESC`,
    [user.id]
  )
  return result.rows
})
