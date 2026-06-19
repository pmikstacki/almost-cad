/**
 * Runs once at Nitro boot. Ensures the RustFS bucket exists before the first
 * request tries to presign against it — a fresh RustFS deployment has no
 * `modulecad` bucket, so the first upload would 404 / fail presigning.
 *
 * Failure is logged but non-fatal: a degraded-storage state surfaces via
 * /api/health's `rustfs` check, which Coolify gates on.
 *
 * NOTE: Nitro server plugins export a default function invoked at startup.
 * `defineEventHandler` is the Nuxt/Nitro-idiomatic shape here.
 */
export default defineEventHandler(async () => {
  try {
    await ensureBucket()
    console.log('[boot] RustFS bucket ensured')
  } catch (err) {
    console.error('[boot] RustFS bucket ensure failed:', err)
  }
})
