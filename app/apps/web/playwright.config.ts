import { defineConfig, devices } from '@playwright/test'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// `__dirname` isn't defined in ES modules (apps/web/package.json has
// "type": "module"). Derive it from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Playwright e2e config for @modulecad/web.
 *
 * The suite runs against the REAL stack brought up by docker-compose.e2e.yml
 * (Postgres on tmpfs → starts unmigrated every run; RustFS with no bucket;
 * dwg-converter with LibreDWG). `pnpm test:e2e:full` does up → test → down.
 *
 * `webServer` starts `nuxt dev` with the e2e env vars passed directly to the
 * process. We can't rely on a separate .env.e2e file because Nuxt's dotenv
 * loader keys on `.env` and ignores DOTENV_CONFIG_PATH — so we parse .env.e2e
 * here and inject every var into webServer.env (and the test process). The
 * containerized boot path is verified separately by `pnpm test:e2e:up`.
 */
const PORT = 3000
const baseURL = `http://localhost:${PORT}`

/**
 * Parse a simple KEY=VALUE .env file into a record. Ignores blanks + comments.
 * Used to share one source of truth (.env.e2e) between the dev server and the
 * test worker without depending on Nuxt's dotenv loader.
 */
function loadEnv(file: string): Record<string, string> {
  const text = readFileSync(join(__dirname, file), 'utf-8')
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    out[key] = val
  }
  return out
}

const e2eEnv = loadEnv('.env.e2e')

// The test worker (and globalSetup) need these too — webServer.env only
// applies to the spawned dev server, not to the Playwright process. Apply
// e2e values as defaults without clobbering anything the caller set.
for (const [k, v] of Object.entries(e2eEnv)) {
  process.env[k] ??= v
}

export default defineConfig({
  testDir: './e2e',
  // Shared Postgres state across tests → run serially, not in parallel.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  // Apply the schema to the tmpfs Postgres once before the suite. Mirrors
  // the prod container's entrypoint migration (which nuxt dev doesn't run).
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    // The converter + LibreDWG can be slow on first run.
    actionTimeout: 15_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    // --host 0.0.0.0 so the dwg-converter container can call the dev server
    // back via host.containers.internal:3000 (needed for the DWG finalize
    // callback). nuxt dev binds to localhost only by default, which isn't
    // reachable from the podman VM.
    command: 'pnpm dev --host 0.0.0.0',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    cwd: __dirname,
    // Pass every e2e env var directly to the dev server process. This is the
    // reliable way to override runtimeConfig in nuxt dev (Nuxt reads process.env
    // at boot; the .env file loader can't be redirected to .env.e2e).
    env: e2eEnv
  }
})
