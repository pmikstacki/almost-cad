<template>
  <section class="auth-card">
    <h1>Sign in</h1>
    <form @submit.prevent="onSubmit">
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
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
  max-width: 380px; margin: 64px auto;
  background: var(--panel); padding: 32px;
  border: 1px solid var(--border); border-radius: 12px;
}
.auth-card h1 { margin: 0 0 24px; font-size: 22px; }
form { display: flex; flex-direction: column; gap: 14px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
.error { color: #ef4444; margin: 0; font-size: 13px; }
.alt { color: var(--muted); font-size: 13px; text-align: center; margin-top: 8px; }
</style>
