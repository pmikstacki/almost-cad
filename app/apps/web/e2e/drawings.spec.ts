import { test, expect, request as apiRequest } from '@playwright/test'
import { uniqueUser, signUp, userIdFor } from './helpers/auth'
import { resetDb, createDrawing } from './helpers/db'

/**
 * Drawings CRUD — all behind auth. Each spec signs up fresh and resets the DB.
 * The primary guard is "must not 500".
 *
 * Each test uses a FRESH APIRequestContext (via apiRequest.newContext()) so
 * the session cookie from sign-up is the only auth state — no leakage across
 * tests via the shared `request` fixture's cookie jar.
 */
test.describe('drawings API', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  /** Sign up + return an authenticated context + its cookie + userId. */
  async function authedUser() {
    const ctx = await apiRequest.newContext()
    const { cookie } = await signUp(ctx, uniqueUser())
    const userId = await userIdFor(ctx, cookie)
    return { ctx, cookie, userId }
  }

  test('GET /api/drawings returns an array (not 500)', async () => {
    const { ctx, cookie } = await authedUser()
    const res = await ctx.get('/api/drawings', { headers: { cookie } })
    expect(res.status(), 'must not 500').toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    await ctx.dispose()
  })

  test('GET /api/drawings lists a created drawing', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const res = await ctx.get('/api/drawings', { headers: { cookie } })
    const body = await res.json()
    expect(body.map((d: any) => d.id)).toContain(drawing.id)
    await ctx.dispose()
  })

  test('GET /api/drawings/:id returns the detail', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const res = await ctx.get(`/api/drawings/${drawing.id}`, { headers: { cookie } })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(drawing.id)
    await ctx.dispose()
  })

  test('GET /api/drawings/:id returns 404 for unknown', async () => {
    const { ctx, cookie } = await authedUser()
    const res = await ctx.get('/api/drawings/00000000-0000-0000-0000-000000000000', {
      headers: { cookie }
    })
    expect(res.status()).toBe(404)
    await ctx.dispose()
  })

  test('unauthenticated requests are rejected (401, not 500)', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get('/api/drawings')
    expect(res.status(), 'unauthenticated must be 401, not 500').toBe(401)
    await ctx.dispose()
  })

  test('POST /api/drawings/:id/modules creates a module', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const res = await ctx.post(`/api/drawings/${drawing.id}/modules`, {
      headers: { cookie },
      data: {
        name: 'Test Module',
        boundary: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 }
        ]
      }
    })
    expect(res.status(), 'must not 500').toBeLessThan(500)
    expect(res.status()).toBe(200)

    const list = await ctx.get(`/api/drawings/${drawing.id}/modules`, {
      headers: { cookie }
    })
    const modules = await list.json()
    expect(modules.some((m: any) => m.name === 'Test Module')).toBe(true)
    await ctx.dispose()
  })

  test('module boundary with <3 points is rejected (400, not 500)', async () => {
    const { ctx, cookie, userId } = await authedUser()
    const drawing = await createDrawing(userId)
    const res = await ctx.post(`/api/drawings/${drawing.id}/modules`, {
      headers: { cookie },
      data: { name: 'Bad', boundary: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
    })
    expect(res.status()).toBe(400)
    await ctx.dispose()
  })

  test('forbidden access to another user drawing is 403', async () => {
    // User A creates a drawing; user B (fresh context) tries to read it → 403.
    const ctxA = await apiRequest.newContext()
    const { cookie: cookieA, userId: userIdA } = await authedUser()
    await ctxA.dispose()
    const drawing = await createDrawing(userIdA)

    const ctxB = await apiRequest.newContext()
    const { cookie: cookieB } = await signUp(ctxB, uniqueUser())
    const res = await ctxB.get(`/api/drawings/${drawing.id}`, { headers: { cookie: cookieB } })
    expect(res.status()).toBe(403)
    await ctxB.dispose()
  })
})


