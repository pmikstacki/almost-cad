import { createAuthClient } from 'better-auth/vue'

/**
 * better-auth browser client + reactive session composable.
 *
 * Usage in pages/components:
 *   const { session, user, signIn, signUp, signOut, pending } = useAuth()
 *
 * Per the Better Auth Nuxt integration docs, import from 'better-auth/vue'
 * (not 'better-auth/client') — the /vue re-export wires the session into Vue
 * reactivity. SSR-safe: the client is created lazily (browser-only) because
 * createAuthClient touches window.location. During SSR we skip it; there is
 * no official better-auth-provided SSR guard, so this app owns the guard.
 */
let authClient: ReturnType<typeof createAuthClient> | null = null
function getClient() {
  if (import.meta.server) return null
  if (!authClient) {
    authClient = createAuthClient({ baseURL: window.location.origin })
  }
  return authClient
}

export function useAuth() {
  const session = useState<ReturnType<typeof useAuth>['session']['value'] | null>(
    'auth:session',
    () => null
  )
  const pending = useState<boolean>('auth:pending', () => true)

  async function fetchSession() {
    const client = getClient()
    if (!client) return // SSR — skip; the browser call hydrates on mount
    pending.value = true
    try {
      const res = await client.getSession()
      session.value = res?.data ?? null
    } catch {
      session.value = null
    } finally {
      pending.value = false
    }
  }

  async function signIn(email: string, password: string) {
    const client = getClient()
    if (!client) return { error: { message: 'Not available during SSR' } } as any
    const res = await client.signIn.email({ email, password })
    if (!res.error) await fetchSession()
    return res
  }

  async function signUp(email: string, password: string, name?: string) {
    const client = getClient()
    if (!client) return { error: { message: 'Not available during SSR' } } as any
    const res = await client.signUp.email({ email, password, name })
    if (!res.error) await fetchSession()
    return res
  }

  async function signOut() {
    const client = getClient()
    if (!client) return
    await client.signOut()
    session.value = null
  }

  const user = computed(() => session.value?.user ?? null)
  const isAuthenticated = computed(() => !!session.value)

  return {
    session,
    user,
    pending,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    fetchSession
  }
}
