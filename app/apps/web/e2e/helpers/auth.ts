/**
 * Auth helpers for the e2e suite.
 *
 * better-auth exposes /api/auth/sign-up/email and /api/auth/sign-in/email
 * which set a `better-auth.session_token` cookie. We return the cookie string
 * (extracted from the set-cookie header) so specs can pass it explicitly,
 * keeping each test's auth state isolated rather than relying on the
 * APIRequestContext's automatic cookie jar (which would leak sessions across
 * tests in the same worker).
 */
import type { APIRequestContext, APIResponse } from '@playwright/test'

export interface TestUser {
  email: string
  password: string
  name: string
}

let counter = 0

/** A fresh unique user per call — avoids collisions across specs/runs. */
export function uniqueUser(): TestUser {
  counter += 1
  const stamp = `${Date.now()}-${counter}-${process.pid}`
  return {
    email: `e2e-${stamp}@example.test`,
    password: 'e2e-password-12345',
    name: `E2E User ${stamp}`
  }
}

/** Pull the `better-auth.session_token=...` pair out of a set-cookie header. */
function sessionTokenFrom(setCookie: string): string {
  // A response may carry multiple set-cookie values (joined by newlines or
  // commas). Find the session_token entry and take its name=value pair.
  const parts = setCookie.split(/[\n,]/)
  for (const p of parts) {
    const trimmed = p.trim()
    if (trimmed.startsWith('better-auth.session_token=')) {
      return trimmed.split(';')[0]
    }
  }
  return ''
}

/**
 * Sign up a new user against a FRESH request context (so its cookie jar
 * doesn't pollute the caller's). Returns the user + the session cookie pair.
 *
 * We use `playwright.request.newContext()` rather than the test's `request`
 * fixture because the fixture auto-stores cookies from every response, which
 * leaks auth state across tests in the same worker.
 */
export async function signUp(
  request: APIRequestContext,
  user: TestUser = uniqueUser()
): Promise<{ user: TestUser; cookie: string; res: APIResponse }> {
  const res = await request.post('/api/auth/sign-up/email', {
    data: { email: user.email, password: user.password, name: user.name },
    // Don't auto-store the set-cookie into the request's jar — we pass it
    // explicitly per-test instead.
    failOnStatusCode: false
  })
  if (res.status() >= 500) {
    throw new Error(`sign-up returned ${res.status()}: ${await res.text()}`)
  }
  const cookie = sessionTokenFrom(res.headers()['set-cookie'] ?? '')
  return { user, cookie, res }
}

/**
 * Sign in an existing user; returns the session cookie pair. Uses a FRESH
 * context so the response cookie isn't persisted into the caller's jar.
 */
export async function signIn(
  request: APIRequestContext,
  user: TestUser
): Promise<string> {
  const res = await request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
    failOnStatusCode: false
  })
  if (res.status() >= 500) {
    throw newError(`sign-in returned ${res.status()}: ${await res.text()}`)
  }
  return sessionTokenFrom(res.headers()['set-cookie'] ?? '')
}

/** Get the session for a cookie; returns null if not authenticated. */
export async function getSession(
  request: APIRequestContext,
  cookie: string
): Promise<any> {
  const res = await request.get('/api/auth/get-session', {
    headers: { cookie },
    failOnStatusCode: false
  })
  // better-auth returns 200 with null body for unauthenticated get-session.
  return res.json()
}

/** Resolve the userId for a session cookie (handy for DB fixtures). */
export async function userIdFor(
  request: APIRequestContext,
  cookie: string
): Promise<string> {
  const session = await getSession(request, cookie)
  return session.user.id
}

function newError(msg: string): Error {
  return new Error(msg)
}

