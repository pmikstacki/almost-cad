<template>
  <section class="auth-card">
    <header class="card-head">
      <h1>Create your account</h1>
      <p class="sub">Start plotting modules from your DWG drawings</p>
    </header>
    <form @submit.prevent="onSubmit">
      <label>
        Name (optional)
        <input v-model="name" type="text" autocomplete="name" placeholder="Your name" />
      </label>
      <label>
        Email
        <input v-model="email" type="email" required autocomplete="email" placeholder="you@example.com" />
      </label>
      <label>
        Password (min 8)
        <input v-model="password" type="password" required minlength="8" autocomplete="new-password" placeholder="••••••••" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
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
definePageMeta({ layout: 'auth' })

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
