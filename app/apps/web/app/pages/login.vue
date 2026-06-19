<template>
  <section class="auth-card">
    <header class="card-head">
      <h1>Welcome back</h1>
      <p class="sub">Sign in to your moduleCad account</p>
    </header>
    <form @submit.prevent="onSubmit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" placeholder="you@example.com" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password" placeholder="••••••••" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>
      <p class="alt">
        No account? <NuxtLink to="/register">Register</NuxtLink>
      </p>
    </form>
  </section>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { signIn } = useAuth()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  const res = await signIn(email.value, password.value)
  loading.value = false
  if (res.error) {
    error.value = res.error.message ?? 'Sign-in failed'
    return
  }
  router.push('/dashboard')
}
</script>

<style scoped>
.auth-card {
  width: 100%;
  background: var(--panel);
  padding: 36px 32px 32px;
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 16px 48px -16px rgba(0, 0, 0, 0.5);
}
.card-head { margin-bottom: 28px; }
.card-head h1 { margin: 0 0 6px; font-size: 22px; font-weight: 600; }
.sub { margin: 0; color: var(--muted); font-size: 13px; }
form { display: flex; flex-direction: column; gap: 16px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
input { margin-top: 2px; text-transform: none; letter-spacing: 0; }
.error {
  color: #f87171; margin: 0; font-size: 13px; padding: 10px 12px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
}
.alt { color: var(--muted); font-size: 13px; text-align: center; margin: 4px 0 0; }
.alt a { color: var(--accent); }
</style>
