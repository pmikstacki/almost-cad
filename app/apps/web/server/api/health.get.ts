/**
 * Health check endpoint — used by Coolify's service healthcheck.
 *
 * Nitro routes: a file named `server/api/health.get.ts` registers
 * `GET /api/health`. (The earlier `server/api/health/get.ts` registered a
 * route at `/api/health/get` instead — the bug behind the 404.)
 *
 * Verifies the Nuxt server responds AND that both dependencies are live:
 * Postgres (own queries + better-auth) and RustFS (S3 object storage).
 * Returns 503 if either is unreachable so Coolify marks the service
 * unhealthy and restarts it.
 */
export default defineEventHandler(async (event) => {
  let dbOk = false
  let rustfsOk = false

  try {
    const res = await db().query('SELECT 1 AS ok')
    dbOk = res.rows[0]?.ok === 1
  } catch {
    dbOk = false
  }

  // RustFS liveness: ListBuckets is a cheap S3 call that requires valid
  // credentials + a reachable endpoint. Same client used for presigning.
  try {
    const { ListBucketsCommand } = await import('@aws-sdk/client-s3')
    await storage().send(new ListBucketsCommand({}))
    rustfsOk = true
  } catch {
    rustfsOk = false
  }

  const ok = dbOk && rustfsOk
  setResponseStatus(event, ok ? 200 : 503)
  return {
    status: ok ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    rustfs: rustfsOk ? 'up' : 'down',
    ts: new Date().toISOString()
  }
})
