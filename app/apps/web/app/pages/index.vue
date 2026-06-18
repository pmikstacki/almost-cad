<template>
  <section class="hero">
    <h1>Module-based CAD plotting</h1>
    <p>
      Open a DWG, draw <strong>modules</strong> over the parts that matter,
      click <strong>Plot</strong> — moduleCad generates professional paper-space
      layouts, each with a clipped viewport and a right stack of logos and an
      auto-counted legend.
    </p>
    <div class="cta">
      <NuxtLink to="/register"><button>Get started</button></NuxtLink>
      <NuxtLink to="/login"><button class="secondary">Sign in</button></NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.hero { max-width: 640px; margin: 80px auto; text-align: center; }
.hero h1 { font-size: 32px; margin-bottom: 16px; }
.hero p { color: var(--muted); margin-bottom: 24px; }
.cta { display: flex; gap: 12px; justify-content: center; }
</style>
