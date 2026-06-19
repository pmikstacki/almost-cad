import { test, expect, request as apiRequest } from '@playwright/test'
import { uniqueUser, signUp, signIn, getSession } from './helpers/auth'
import { resetDb } from './helpers/db'

/**
 * Auth — the four prod-failing endpoints. Every assertion's primary job is
 * to FAIL if the endpoint returns 500 (the prod symptom). The happy path
 * proves the migration ran (better-auth tables exist) and the server boots.
 *
 * Cookie isolation matters here: better-auth does NOT re-issue a session
 * cookie on sign-in if the request is already authenticated. So a sign-up
 * (which sets a cookie) followed by a sign-in on the SAME request context
 * yields no new set-cookie. We use a FRESH context per auth action so each
 * starts unauthenticated.
 */
test.describe('better-auth endpoints', () => {
  test.beforeEach(async () => {
    await resetDb()
  })

  test('sign-up returns <500 and sets a session cookie', async () => {
    const ctx = await apiRequest.newContext()
    const { cookie } = await signUp(ctx, uniqueUser())
    expect(cookie).toContain('better-auth.session_token=')
    await ctx.dispose()
  })

  test('get-session returns the user when authenticated', async () => {
    const ctx = await apiRequest.newContext()
    const { user, cookie } = await signUp(ctx, uniqueUser())
    const session = await getSession(ctx, cookie)
    expect(session).not.toBeNull()
    expect(session.user.email).toBe(user.email)
    await ctx.dispose()
  })

  test('get-session returns null when unauthenticated', async () => {
    const ctx = await apiRequest.newContext()
    const res = await ctx.get('/api/auth/get-session')
    expect(res.status(), 'get-session must not 500').toBeLessThan(500)
    const body = await res.json()
    expect(body).toBeNull()
    await ctx.dispose()
  })

  test('sign-in returns <500 and sets a session cookie', async () => {
    const user = uniqueUser()
    // Sign up on one context (to create the user), then sign in on a FRESH
    // context that carries no session cookie.
    const ctxA = await apiRequest.newContext()
    await signUp(ctxA, user)
    await ctxA.dispose()

    const ctxB = await apiRequest.newContext()
    const cookie = await signIn(ctxB, user)
    expect(cookie).toContain('better-auth.session_token=')

    const session = await getSession(ctxB, cookie)
    expect(session.user.email).toBe(user.email)
    await ctxB.dispose()
  })

  test('sign-in with wrong password does not 500', async () => {
    const user = uniqueUser()
    const ctxA = await apiRequest.newContext()
    await signUp(ctxA, user)
    await ctxA.dispose()

    const ctxB = await apiRequest.newContext()
    const res = await ctxB.post('/api/auth/sign-in/email', {
      data: { email: user.email, password: 'wrong-password' }
    })
    // better-auth rejects bad credentials with a non-500 (typically 401/422).
    expect(res.status(), 'bad sign-in must not 500').toBeLessThan(500)
    await ctxB.dispose()
  })
})

