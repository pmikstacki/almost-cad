// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  // moduleCad runtime configuration. Secrets come from the environment in
  // production (Coolify per-resource env); locally from apps/web/.env.
  runtimeConfig: {
    // Server-only (NEVER exposed to the client).
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://modulecad:modulecad@localhost:5432/modulecad',
    betterAuthSecret:
      process.env.BETTER_AUTH_SECRET ?? 'dev-only-insecure-secret-change-me',
    rustfsEndpoint: process.env.RUSTFS_ENDPOINT ?? 'http://localhost:9000',
    rustfsAccessKey: process.env.RUSTFS_ACCESS_KEY ?? 'modulecad',
    rustfsSecretKey: process.env.RUSTFS_SECRET_KEY ?? 'modulecad-dev-key',
    rustfsBucket: process.env.RUSTFS_BUCKET ?? 'modulecad',
    dwgConverterUrl:
      process.env.DWG_CONVERTER_URL ?? 'http://localhost:8080',

    // Public (exposed to the client via useRuntimeConfig().public).
    public: {
      // The browser-facing RustFS origin for presigned uploads. In Coolify
      // this is the SERVICE_FQDN_RUSTFS value; locally the same as rustfsEndpoint.
      rustfsPublicEndpoint:
        process.env.RUSTFS_PUBLIC_ENDPOINT ??
        process.env.RUSTFS_ENDPOINT ??
        'http://localhost:9000'
    }
  },

  // Pin better-auth to patched versions (CVE-2026-41427 awareness); the
  // package itself is pinned in apps/web/package.json.
  nitro: {
    // Allow large multipart uploads to presign routes if ever proxied; note
    // that browser uploads normally bypass Nuxt and go direct to RustFS.
    experimental: {
      // enable SSE / event-stream support in Nitro routes
      openAPI: false
    }
  },

  app: {
    head: {
      title: 'moduleCad',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Module-based CAD plotting' }
      ]
    }
  }
})
