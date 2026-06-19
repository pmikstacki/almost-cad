import { auth } from '~~/server/utils/auth'

/**
 * better-auth catch-all handler.
 *
 * Better-auth exposes all auth endpoints (signUp, signIn, signOut, getSession,
 * OAuth callbacks, etc.) under /api/auth/*. Mounting toHandle here makes them
 * live. The handler is method-agnostic — a single unsuffixed `[...all].ts`
 * catch-all (per the Better Auth Nuxt docs) lets Nitro dispatch ALL HTTP
 * methods (GET/POST/PUT/DELETE) to it. The earlier split into
 * `[...all].get.ts` + `[...all].post.ts` silently dropped PUT/DELETE/etc.
 */
export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event))
})
