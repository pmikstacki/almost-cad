import { streamJobEvents } from '~~/server/utils/jobs'

/**
 * GET /api/jobs/:id/events — Server-Sent Events stream of conversion progress.
 *
 * Uses H3's createEventStream. Coolify's Traefik must NOT buffer this route
 * (see docker-compose.yml + GUIDE.md "Traefik buffering workaround"). The
 * stream auto-closes when the job reaches a terminal status (ready/error).
 */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'job id required' })
  return streamJobEvents(event, id)
})
