<template>
  <section class="auth-card">
    <h1>Create your account</h1>
    <form @submit.prevent="onSubmit">
      <label>
        Name (optional)
        <input v-model="name" type="text" autocomplete="name" />
      </label>
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Password (min 8)
        <input v-model="password" type="password" required minlength="8" autocomplete="new-password" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Creating…' : 'Create account' }}
      </button>
      <p class="alt">
        Already have an account? <NuxtLink to="/login">Sign in</NuxtLink>
      </p>
    </form>
  </section>
</template>

<script setup lang="ts">
const { signUp } = useAuth()
const router = useRouter()

const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  loading.value = true
  const res = await signUp(email.value, password.value, name.value || undefined)
  loading.value = false
  if (res.error) {
    error.value = res.error.message ?? 'Registration failed'
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
