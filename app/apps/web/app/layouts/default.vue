<template>
  <div class="layout">
    <header class="topbar">
      <div class="brand">
        <NuxtLink to="/">module<span class="accent">Cad</span></NuxtLink>
      </div>
      <nav class="nav">
        <NuxtLink to="/dashboard">Drawings</NuxtLink>
      </nav>
      <div class="user-area">
        <template v-if="isAuthenticated">
          <span class="user-email">{{ user?.email }}</span>
          <button class="secondary" @click="onSignOut">Sign out</button>
        </template>
        <template v-else>
          <NuxtLink to="/login">Sign in</NuxtLink>
        </template>
      </div>
    </header>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const { isAuthenticated, user, signOut } = useAuth()
const router = useRouter()

async function onSignOut() {
  await signOut()
  router.push('/login')
}
</script>

<style scoped>
.layout { min-height: 100vh; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; gap: 24px;
  padding: 0 24px; height: 56px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.brand { font-weight: 600; font-size: 16px; }
.brand .accent { color: var(--accent); }
.nav { display: flex; gap: 16px; flex: 1; }
.user-area { display: flex; align-items: center; gap: 12px; }
.user-email { color: var(--muted); }
.content { flex: 1; padding: 24px; max-width: 1200px; margin: 0 auto; width: 100%; }
</style>
