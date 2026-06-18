/**
 * Health check endpoint — used by Coolify's service healthcheck.
 *
 * Verifies the Nuxt server responds AND the Postgres connection is live.
 * Returns 503 if the DB is unreachable so Coolify marks the service unhealthy.
 */
export default defineEventHandler(async (event) => {
  let dbOk = false
  try {
    const pool = db()
    const res = await pool.query('SELECT 1 AS ok')
    dbOk = res.rows[0]?.ok === 1
  } catch {
    dbOk = false
  }

  const ok = dbOk
  setResponseStatus(event, ok ? 200 : 503)
  return {
    status: ok ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    ts: new Date().toISOString()
  }
})
