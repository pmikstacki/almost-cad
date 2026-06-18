import { betterAuth } from 'better-auth'
import { Pool, type Pool as PgPool } from 'pg'

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
  database: {
    // Kysely-style pg pool config. better-auth manages its own schema via
    // `betterAuth` tables (user, session, account, verification); we run a
    // drift-style SQL migration at deploy time.
    type: 'postgres',
    url: useRuntimeConfig().databaseUrl
  },
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
export function db(): PgPool {
  if (!_pool) {
    _pool = new Pool({ connectionString: useRuntimeConfig().databaseUrl })
  }
  return _pool
}
