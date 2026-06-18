/**
 * POST /api/jobs/:id/update — internal callback from the dwg-converter service.
 *
 * Body: { status: 'converting'|'ready'|'error', message?, dxfKey?, progress? }
 *
 * This route is hit by the converter (internal network) when conversion
 * progresses or completes. It both persists to the drawings row and emits a
 * job event so any subscribed SSE clients update live.
 *
 * Security: this is protected by the same /api/* auth middleware as everything
 * else, BUT the converter is an internal service without a user session. We
 * therefore whitelist this route: if the request comes from the internal
 * dwg-converter (identifiable by a shared secret header DWG_CONVERTER_SECRET),
 * we skip the user-session check. The auth middleware runs first and would
 * reject this — so we handle the secret check here and the middleware's 401
 * is the fallback for anything that isn't a valid converter call.
 *
 *   NOTE: for this to work, the auth middleware needs to skip this path.
 *   See the early-return added there for /api/jobs/:id/update.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'job id required' })

  // Verify the shared secret.
  const secret = getHeader(event, 'x-dwg-converter-secret')
  const expected = process.env.DWG_CONVERTER_SECRET ?? 'dev-converter-secret'
  if (secret !== expected) {
    throw createError({ statusCode: 403, statusMessage: 'invalid converter secret' })
  }

  const body = await readBody<{
    status: 'converting' | 'ready' | 'error'
    message?: string
    dxfKey?: string
    progress?: number
  }>(event)

  const evt = {
    status: body.status,
    message: body.message,
    progress: body.progress,
    ts: new Date().toISOString()
  }

  if (body.status === 'ready' && body.dxfKey) {
    await db().query(
      `UPDATE drawings SET status = 'ready', dxf_key = $1, updated_at = NOW() WHERE id = $2`,
      [body.dxfKey, id]
    )
  } else if (body.status === 'error') {
    await db().query(
      `UPDATE drawings SET status = 'error', updated_at = NOW() WHERE id = $1`,
      [id]
    )
  }

  emit(id, evt)
  return { ok: true }
})
