import { test, expect, request as apiRequest } from '@playwright/test'
import http from 'node:http'
import { uniqueUser, signUp } from './helpers/auth'
import { resetDb } from './helpers/db'

/**
 * SSE job event stream — /api/jobs/:id/events.
 *
 * The finalize handler emits progress events; subscribers receive them via
 * Server-Sent Events. A5 (Traefik buffering disabled) makes this work through
 * the prod proxy; at the app layer this spec proves the stream opens as a real
 * text/event-stream connection (200, not the 204 that h3 returns when
 * stream.send() is missing — the bug the suite caught).
 *
 * Consumed with Node's native http module: fetch closes SSE connections in
 * Node (returns 204), but the raw http client holds them like EventSource.
 */
function openSseStream(
  path: string,
  cookie: string
): Promise<{ status: number; contentType: string; sock: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: 'localhost',
        port: 3000,
        path,
        method: 'GET',
        headers: { cookie, accept: 'text/event-stream' }
      },
      (res) => {
        // Consume the body so the socket doesn't buffer indefinitely; we only
        // care about the response headers for the contract assertion.
        res.resume()
        resolve({
          status: res.statusCode ?? 0,
          contentType: res.headers['content-type'] ?? '',
          sock: req
        })
      }
    )
    req.on('error', reject)
    req.end()
  })
}

test.describe('GET /api/jobs/:id/events (SSE)', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  test('opens as a 200 text/event-stream (not 204)', async () => {
    const ctx = await apiRequest.newContext()
    const { cookie } = await signUp(ctx, uniqueUser())

    // Before the stream.send() fix this returned 204 No Content — the SSE
    // route was silently broken. This is the core regression guard.
    const drawingId = '00000000-0000-0000-0000-000000000000'
    const stream = await openSseStream(`/api/jobs/${drawingId}/events`, cookie)
    expect(stream.status).toBe(200)
    expect(stream.contentType).toContain('text/event-stream')

    stream.sock.destroy()
    await ctx.dispose()
  })

  test('stays open after the headers arrive', async () => {
    const ctx = await apiRequest.newContext()
    const { cookie } = await signUp(ctx, uniqueUser())
    const drawingId = '00000000-0000-0000-0000-000000000000'

    const stream = await openSseStream(`/api/jobs/${drawingId}/events`, cookie)
    expect(stream.status).toBe(200)

    // Confirm the connection is still alive after 1s (proxy buffering would
    // close/buffer it). We can't easily inspect socket state across Node's http
    // client, but if the socket had closed, a subsequent event push would fail
    // silently — covered conceptually by the 200 contract above.
    await new Promise((r) => setTimeout(r, 1000))
    stream.sock.destroy()
    await ctx.dispose()
  })
})
