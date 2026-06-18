import { auth } from '~~/server/utils/auth'

/**
 * better-auth catch-all handler.
 *
 * better-auth exposes all auth endpoints (signUp, signIn, signOut, getSession,
 * etc.) under /api/auth/*. Mounting toHandle here makes them live.
 *
 * Nuxt/Nitro picks up any HTTP method on the [...all] route via the special
 * `defineEventHandler` + betterAuth `toNodeHandler` interop.
 */
export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event))
})
