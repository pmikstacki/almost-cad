import { createAuthClient } from 'better-auth/client'

/**
 * better-auth browser client + reactive session composable.
 *
 * Usage in pages/components:
 *   const { session, user, signIn, signUp, signOut, pending } = useAuth()
 *
 * SSR-safe: the client handles cookie-based sessions transparently. We
 * initialise the session state on mount via $fetch('/api/auth/get_session').
 */
const authClient = createAuthClient({
  baseURL: window.location.origin
})

export function useAuth() {
  const session = useState<ReturnType<typeof useAuth>['session']['value'] | null>(
    'auth:session',
    () => null
  )
  const pending = useState<boolean>('auth:pending', () => true)

  async function fetchSession() {
    pending.value = true
    try {
      const res = await authClient.getSession()
      session.value = res?.data ?? null
    } catch {
      session.value = null
    } finally {
      pending.value = false
    }
  }

  async function signIn(email: string, password: string) {
    const res = await authClient.signIn.email({ email, password })
    if (!res.error) await fetchSession()
    return res
  }

  async function signUp(email: string, password: string, name?: string) {
    const res = await authClient.signUp.email({ email, password, name })
    if (!res.error) await fetchSession()
    return res
  }

  async function signOut() {
    await authClient.signOut()
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
