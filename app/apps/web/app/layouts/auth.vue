<template>
  <div class="auth-layout">
    <!-- Brand mark above the card; no nav, no user-area. -->
    <NuxtLink to="/" class="brand-mark">
      <span class="brand-word">module</span><span class="brand-accent">Cad</span>
    </NuxtLink>
    <div class="auth-slot">
      <slot />
    </div>
    <footer class="auth-foot">
      <span>moduleCad · module-based CAD plotting</span>
    </footer>
  </div>
</template>

<style scoped>
/* Full-viewport centered column: brand → card → footer. The dark theme vars
   (--bg, --panel, --border, --accent, --muted) are defined globally in app.vue. */
.auth-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 40px 20px;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgba(59, 130, 246, 0.08), transparent),
    var(--bg);
}
.brand-mark {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
  user-select: none;
}
.brand-word { color: var(--text); }
.brand-accent { color: var(--accent); }
.auth-slot {
  width: 100%;
  max-width: 400px;
  display: flex;
  justify-content: center;
}
.auth-foot {
  color: var(--muted);
  font-size: 12px;
}
</style>
