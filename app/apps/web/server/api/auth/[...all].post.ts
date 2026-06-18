import { auth } from '~~/server/utils/auth'

/**
 * better-auth catch-all handler (POST side).
 * Pairs with [...all].get.ts — same handler, mounted for POST so that
 * signIn/signUp/etc. work. See that file for details.
 */
export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event))
})
