/**
 * Health check endpoint — used by Coolify's service healthcheck.
 *
 * Nitro routes: a file named `server/api/health.get.ts` registers
 * `GET /api/health`. (The earlier `server/api/health/get.ts` registered a
 * route at `/api/health/get` instead — the bug behind the 404.)
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

  setResponseStatus(event, dbOk ? 200 : 503)
  return {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    ts: new Date().toISOString()
  }
})
