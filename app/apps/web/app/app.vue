<template>
  <div class="app-root">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
// On app mount, hydrate the session from the authed cookie.
const { fetchSession } = useAuth()
onMounted(() => {
  fetchSession()
})
</script>

<style>
:root {
  --bg: #0f1115;
  --panel: #161a22;
  --text: #e6e8ee;
  --muted: #8b93a7;
  --accent: #3b82f6;
  --border: #232836;
}
* { box-sizing: border-box; }
html, body, #__nuxt { margin: 0; padding: 0; height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}
input {
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  width: 100%;
}
.app-root { min-height: 100vh; }
</style>
