import { betterAuth } from 'better-auth'
import { Pool, type Pool as PgPool } from 'pg'
import type { H3Event } from 'h3'

/**
 * better-auth server instance for moduleCad.
 *
 * Mounted as a Nitro catch-all route in server/api/auth/[...all].get.ts.
 * Uses PostgreSQL as the backing store (Kysely + pg pool). Sessions are
 * server-side cookie sessions, not client JWTs.
 *
 * Pinned better-auth version range avoids CVE-2026-41427 (OAuth client
 * registration by non-privileged users) — see package.json.
 */
export const auth = betterAuth({
  // better-auth expects a live `pg.Pool` instance as `database` (the adapter
  // detects it via its `connect` method and wraps it in a Kysely
  // PostgresDialect). Passing `{ type, url }` does NOT work — none of the
  // adapter's dialect-selection branches recognize that shape, so it returns
  // null and throws "Failed to initialize database adapter". This was the
  // root cause of every auth 500 (get-session / sign-in / sign-up).
  database: new Pool({ connectionString: useRuntimeConfig().databaseUrl }),
  secret: useRuntimeConfig().betterAuthSecret,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // TODO Phase 1.5: enable once mailer is wired
    minPasswordLength: 8,
    maxPasswordLength: 128
  },
  session: {
    // Cookie-based, server-side stored sessions.
    cookieCache: {
      enabled: true,
      maxAge: 300 // 5 min re-validation window
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24 // refresh session daily
  },
  // OAuth providers are opt-in via env (Phase 1.5). Left disabled by default
  // to keep the local dev surface small.
  socialProviders: {}
})

/**
 * Lazy-shared pg pool for our own app queries (the drawings/modules tables).
 * better-auth manages its own connection; this one is for moduleCad data.
 *
 * Note: `pg` (node-postgres) exports the `Pool` class, NOT a `createPool`
 * factory function. Use `new Pool(...)`.
 */
let _pool: PgPool | null = null
/**
 * Shared pg pool for our app queries (drawings/modules). Accepts an optional
 * H3Event so we can resolve runtimeConfig per-request (Nuxt 4 recommends
 * `useRuntimeConfig(event)` in server routes for correct override resolution).
 */
export function db(event?: H3Event): PgPool {
  if (!_pool) {
    _pool = new Pool({ connectionString: useRuntimeConfig(event).databaseUrl })
  }
  return _pool
}
