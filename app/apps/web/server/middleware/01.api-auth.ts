import { auth } from '~~/server/utils/auth'

/**
 * Protect all /api/* routes except the better-auth handler itself and the
 * public health endpoint. Unauthenticated requests get 401.
 *
 * Phase 2+ routes (/api/uploads/presign, /api/jobs/*, /api/drawings/*) are
 * thus all authed by default.
 */
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/')) return

  // Public API routes:
  if (
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/health')
  ) {
    return
  }

  // Internal converter callback: authed by a shared secret checked in the
  // handler itself (POST /api/jobs/:id/update), not by a user session.
  if (url.pathname.match(/\/api\/jobs\/[^/]+\/update$/)) {
    return
  }

  // Verify session; set event.context.user for downstream handlers.
  const session = await auth.api.getSession({ headers: event.headers })
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  event.context.session = session
  event.context.user = session.user
})
