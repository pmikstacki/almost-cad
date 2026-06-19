# Full deployment + end-to-end feature coverage

**Date:** 2026-06-19
**Status:** Awaiting user review
**Scope:** Make the deployed app fully functional across every spec feature
(auth, drawings CRUD, upload→convert pipeline, module layout, DXF/DWG export,
SSE), and add a Playwright e2e suite (podman-compose) that exercises the full
flow against real Postgres + RustFS + dwg-converter — reproducing and
preventing the prod 500s.

## Motivation

Prod returns 500 on `get-session`, `sign-in/email`, `sign-up/email`, and
`drawings`. Auditing the entire backend against the vendored source and the
deployment files surfaced **one blocking root cause and twelve secondary
issues** across six subsystems. The blocking cause:

> **The web container never boots.** `apps/web/Dockerfile:53` copies the
> migration runner to `/app/migrate.ts`, but `docker-entrypoint.sh:11` runs
> `node --experimental-strip-types /app/migrate.js` — a `.ts`/`.js` typo.
> The entrypoint exits non-zero, `restart: unless-stopped` loops it, and no
> server ever listens on :3000. Every route 500s (or 502s at the proxy).

Because nothing boots, the migration (added in commit `f6692ef` to fix a
*previous* `BetterAuthError`) has never actually executed in prod either.
Fixing the typo is necessary but not sufficient — the rest of the list
ensures the full feature set works once the server is up.

## Verified findings (full audit)

Every route was read, plus both Dockerfiles, the converter, the storage
helper, the migration runner, the entrypoint, the compose file, the auth
middleware, the health route, and `nuxt.config.ts`.

| # | Subsystem | State | Issue / fix |
|---|---|---|---|
| 1 | Web container boot | 🔴 broken | `migrate.ts` vs `migrate.js` typo in entrypoint → container loops |
| 2 | DB migration | 🟡 unverified | Runner exists & looks correct, never executed (blocked by #1). Idempotent, tracks `_migrations`. Verify after #1. |
| 3 | Auth (better-auth) | 🟢 code OK | 500s only due to #1+#2 |
| 4 | Drawings CRUD | 🟢 code OK | 500s only due to #1 |
| 5 | Upload→finalize→convert | 🟡 untested | Coherent but callback URL is #8 |
| 6 | DXF export + DWG conv. | 🟢 mostly OK | sound |
| 7 | SSE job events | 🟡 proxy dep | compose lacks the `modulecad-sse-nobuffer` buffering-disable middleware DEPLOY.md references |
| 8 | Converter callback URL | 🔴 bug | `finalize.post.ts:116-117` builds callback via `.replace('dwg-converter','web').replace(':8080',':3000')` — fragile. Replace with `WEB_INTERNAL_URL` env var |
| 9 | RustFS bucket bootstrap | 🟡 missing | `ensureBucket()` exists, never called. First upload 404s on fresh RustFS. Needs boot hook |
| 10 | Health route | 🟡 partial | DB only; no RustFS check |
| 11 | Compose / Coolify | 🟢 mostly OK | at repo root (commit `9c5d0eb`); add SSE middleware + RustFS healthcheck |
| 12 | PDF export | 🔴 dead | (prior spec) vendored plugin renders model-space only → **drop** per user decision |
| 13 | `tools/run-migration.mjs` | 🔴 dangling | `package.json:14` `db:migrate` points at a non-existent file |

---

## Design

### Phase A — Make it boot (server-side blockers)

**A1. Fix the entrypoint typo — item #1**

`app/apps/web/docker-entrypoint.sh:11`:

```diff
- node --experimental-strip-types /app/migrate.js
+ node --experimental-strip-types /app/migrate.ts
```

This is the single change that lets the container boot. Verify by building +
running the image locally (Phase C e2e exercises this end-to-end).

**A2. Converter callback via `WEB_INTERNAL_URL` — item #8**

The string-replace hack assumes the converter URL differs from the web URL
only by service name and port. It breaks the moment the URL shape differs.

- `nuxt.config.ts` `runtimeConfig` — add:

  ```ts
  webInternalUrl: process.env.WEB_INTERNAL_URL ?? 'http://localhost:3000'
  ```

- `docker-compose.yml` `web` service — add:

  ```yaml
  - WEB_INTERNAL_URL=http://web:3000
  ```

- `finalize.post.ts:116-117` — replace the hack:

  ```ts
  const callbackUrl = `${useRuntimeConfig().webInternalUrl}/api/jobs/${jobId}/update`
  ```

**A3. RustFS bucket bootstrap on boot — item #9**

`ensureBucket()` exists in `storage.ts` but nothing calls it. On a fresh
RustFS, the `modulecad` bucket doesn't exist, so the first presigned PUT
(failed bucket) or GET (404) fails.

Add `app/apps/web/server/plugins/01.storage.ts`:

```ts
/**
 * Runs once at Nitro boot. Ensures the RustFS bucket exists before the first
 * request tries to presign against it. Failures are logged but non-fatal —
 * a degraded-storage state surfaces via /api/health's rustfs check.
 */
export default defineEventHandler(async () => {
  if (import.meta.dev || process.env.NODE_ENV !== 'production') {
    // In dev, the bucket may legitimately not exist yet; still try.
  }
  try {
    await ensureBucket()
    console.log('[boot] RustFS bucket ensured')
  } catch (err) {
    console.error('[boot] RustFS bucket ensure failed:', err)
  }
})
```

(Whether to run in dev depends on whether the dev `.env` points at a live
RustFS — it does by default. Always attempt.)

**A4. Extend health route with RustFS — item #10**

`health.get.ts` — add a RustFS liveness probe (S3 `ListBuckets`) alongside
the DB probe. Return 200 only if both up; 503 otherwise. Surface both
fields: `{ status, db, rustfs, ts }`. The `storage()` S3 client is the same
one used for presigning, so this tests real connectivity.

```ts
let dbOk = false, rustfsOk = false
try { dbOk = (await db().query('SELECT 1')).rows[0]?.ok === 1 } catch {}
try {
  const { ListBucketsCommand } = await import('@aws-sdk/client-s3')
  await storage().send(new ListBucketsCommand({}))
  rustfsOk = true
} catch {}

const ok = dbOk && rustfsOk
setResponseStatus(event, ok ? 200 : 503)
return { status: ok ? 'ok' : 'degraded', db: dbOk ? 'up':'down', rustfs: rustfsOk ? 'up':'down', ts: new Date().toISOString() }
```

**A5. SSE buffering middleware in compose — item #7**

`docker-compose.yml` `web` service — add the Traefik/Coolify labels that
disable response buffering for the SSE route. DEPLOY.md already documents
`modulecad-sse-nobuffer`; bake it into the compose so it's not a manual
Coolify step:

```yaml
  web:
    environment:
      - SERVICE_FQDN_WEB
      # ... existing
    labels:
      - coolify.proxy=true
      - coolify.proxy.buffering=false
      # route-level: disable buffering only for the SSE path
      - traefik.http.middlewares.modulecad-sse-nobuffer.buffering=false
      - traefik.http.routers.modulecad-sse.middlewares=modulecad-sse-nobuffer
      - traefik.http.routers.modulecad-sse.rule=PathPrefix(`/api/jobs/`) && PathRegexp(`/events$`)
```

> The exact label syntax depends on the Coolify version's Traefik provider.
> If the route-level rule proves finicky, fall back to disabling buffering
> for the whole `web` service (acceptable: uploads bypass Nuxt anyway, so
> body-size buffering on other routes isn't load-bearing). Decide during
> implementation against the live Coolify Traefik config.

**A6. Drop the dead PDF path — item #12**

Per the prior cleanup spec and user decision, remove PDF cleanly:

- `apps/web/package.json` — remove `@mlightcad/cad-pdf-plugin` dep.
- `apps/web/app/composables/useExport.ts` — drop `pdfUrl` from
  `ExportResult`; update the header comment.
- `apps/web/app/pages/drawings/[id]/preview.vue` — delete
  `renderPdfBase64()` and the `pdfUrl` branch; button becomes
  "Export (DXF/DWG)".
- `apps/web/server/api/drawings/[id]/export/pdf.post.ts` — delete.
- `apps/web/server/api/drawings/[id]/export.post.ts` — drop the
  `pdfUrl: null` return field.
- CHANGELOG / GUIDE / DEPLOY — note PDF deferred.

**A7. Remove the dangling `db:migrate` script — item #13**

`apps/web/package.json:14` `db:migrate` → `node ../../tools/run-migration.mjs`
points at a file that doesn't exist. The migration now runs in-container via
the entrypoint (A1), so this dev script is redundant. Options:

- **Recommended:** replace it with `pnpm exec tsx server/scripts/migrate.ts`
  so devs can run migrations locally against their dev DB (useful). Add
  `tsx` as a devDep if not present.
- Alternative: delete the script entirely.

Pick during implementation.

---

### Phase B — End-to-end Playwright suite (podman compose)

**Goal:** reproduce the prod failure mode (server won't boot / DB unmigrated
/ bucket missing) and prove every user-facing flow works end-to-end against
real Postgres + RustFS + dwg-converter.

**Environment:** `podman compose` brings up the **real** stack:

`app/apps/web/docker-compose.e2e.yml`:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment: { POSTGRES_DB: modulecad, POSTGRES_USER: modulecad, POSTGRES_PASSWORD: modulecad }
    ports: ["5433:5432"]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U modulecad"], interval: 2s, timeout: 2s, retries: 30 }
    tmpfs: [ /var/lib/postgresql/data ]   # ephemeral: every run starts unmigrated

  rustfs:
    image: rustfs/rustfs:latest
    environment: { RUSTFS_ACCESS_KEY: modulecad, RUSTFS_SECRET_KEY: e2e-key }
    ports: ["9001:9000"]
    # no volume: ephemeral, bucket recreated each run (exercises ensureBucket)

  dwg-converter:
    build: { context: ../../, dockerfile: apps/dwg-converter/Dockerfile }
    environment:
      PORT: 8080
      DWG_CONVERTER_SECRET: e2e-secret
      RUSTFS_ENDPOINT: http://rustfs:9000
      RUSTFS_ACCESS_KEY: modulecad
      RUSTFS_SECRET_KEY: e2e-key
    depends_on: [rustfs]
```

> The dwg-converter image builds LibreDWG from source (~8 min). To keep the
> suite fast, the e2e setup builds it once and reuses the image across runs
> (`podman compose build` as a setup step, not per-test).

`app/apps/web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

const PORT = 3000
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,              // shared DB state → serial
  retries: 0,
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'pnpm dev',             // nuxt dev against .env.e2e
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    cwd: __dirname
  }
})
```

`app/apps/web/.env.e2e`:

```
DATABASE_URL=postgres://modulecad:modulecad@localhost:5433/modulecad
BETTER_AUTH_SECRET=e2e-test-secret-0123456789abcdef0123456789abcdef
RUSTFS_ENDPOINT=http://localhost:9001
RUSTFS_PUBLIC_ENDPOINT=http://localhost:9001
RUSTFS_ACCESS_KEY=modulecad
RUSTFS_SECRET_KEY=e2e-key
RUSTFS_BUCKET=modulecad
DWG_CONVERTER_URL=http://localhost:8080
DWG_CONVERTER_SECRET=e2e-secret
WEB_INTERNAL_URL=http://localhost:3000
```

**Scripts** (`apps/web/package.json`):

```json
"test:e2e": "playwright test",
"test:e2e:up": "podman compose -f docker-compose.e2e.yml up -d --build --wait",
"test:e2e:down": "podman compose -f docker-compose.e2e.yml down -v",
"test:e2e:full": "pnpm test:e2e:up && pnpm test:e2e && pnpm test:e2e:down"
```

`@playwright/test` added as a devDep.

**Test files** (`app/apps/web/e2e/`):

1. **`health.spec.ts`** — boots the stack from empty (tmpfs DB, no bucket).
   - `GET /api/health` → 200 with `{ db: 'up', rustfs: 'up' }`.
   - This proves A1 (boot), A3 (bucket), A4 (health) all work.

2. **`auth.spec.ts`** — the four failing endpoints.
   - `POST /api/auth/sign-up/email` → 200/201, sets session cookie.
   - `GET /api/auth/get-session` (with cookie) → 200, returns user.
   - `POST /api/auth/sign-in/email` → 200, sets cookie.
   - `GET /api/auth/get-session` (no cookie) → 200 with `null` session body
     (better-auth returns null rather than 401 for unauthenticated
     get-session; the 401s come from our own middleware on *other* routes,
     not from better-auth itself).
   - **Each asserts not-500.** This is the regression test for the prod
     symptom.

3. **`drawings.spec.ts`** — CRUD behind auth.
   - Sign up → create drawing row directly via a fixture (or via the upload
     flow in 4) → `GET /api/drawings` → 200, array containing it.
   - `GET /api/drawings/:id` → 200 detail.
   - `GET /api/drawings/:id/modules` → 200.
   - `POST /api/drawings/:id/modules` → 201, appears in list.
   - `PATCH`/`DELETE` module → 200, reflected in list.
   - Forbidden (other user's drawing) → 403.

4. **`upload-pipeline.spec.ts`** — the full convert pipeline.
   - Sign up. Presign a DXF upload. PUT a real DXF fixture to RustFS via the
     presigned URL. POST `/finalize`. Poll `/api/drawings/:id` until
     `status='ready'` (DXF is immediate). `GET /api/drawings/:id/dxf` → 200
     presigned URL that fetches the original bytes.
   - Repeat with a DWG fixture → `status` transitions
     `processing`→`ready` via the converter callback (A2 proves out here).
     If LibreDWG can't round-trip the test DWG, assert `processing` was
     reached and the converter logged a result (don't hard-fail on a
     LibreDWG quirk — note it).
   - Requires `e2e/fixtures/sample.dxf` + `sample.dwg` committed (small,
     hand-authored or CC0).

5. **`sse.spec.ts`** — the job event stream.
   - Start a DWG finalize, open `GET /api/jobs/:id/events` (EventSource),
     assert at least one `{status:'converting'|'ready'|'error'}` event
     arrives within a timeout. Proves A5 (no buffering) at the app layer
     (proxy buffering is a Coolify-only concern; document it).

6. **`export.spec.ts`** — DXF + DWG export.
   - With a ready drawing + at least one module, `POST /export` with a DXF
     payload → 200 with `{ dxfUrl, dwgUrl }` (no `pdfUrl`). Fetch `dxfUrl`
     → bytes match. `dwgUrl` may 404 until conversion; poll up to N s.

**Fixtures & helpers** (`e2e/fixtures/`, `e2e/helpers/`):
- `auth.ts` — sign-up + cookie helpers, returns an authenticated
  `APIRequestContext`.
- `db.ts` — direct `pg` reset between tests (truncate user/session/etc.) for
  deterministic isolation, since the DB is shared.
- `sample.dxf`, `sample.dwg` — tiny fixtures.

---

### Phase C — Verify the deployment story

Not code, but verification steps baked into the plan:

1. `podman compose -f docker-compose.yml config --quiet` validates the prod
   compose (after A2/A5 edits).
2. `podman compose -f docker-compose.e2e.yml up -d --build` builds the real
   web image via the real Dockerfile — which runs the real entrypoint —
   proving A1 end-to-end (the e2e suite uses `nuxt dev`, but a separate
   one-shot build+boot smoke confirms the containerized path).
3. `pnpm --filter @modulecad/web build` must succeed after A6/A7 (PDF
   removal, script change).

---

## Testing strategy summary

| Change | Verification |
|---|---|
| A1 entrypoint typo | e2e suite boots at all; separate `podman compose build` smoke |
| A2 callback URL | `upload-pipeline.spec.ts` DWG path reaches `ready` via callback |
| A3 bucket bootstrap | `health.spec.ts` asserts `rustfs: 'up'` from empty |
| A4 health | `health.spec.ts` |
| A5 SSE | `sse.spec.ts` |
| A6 PDF drop | `pnpm build` succeeds; `export.spec.ts` asserts no `pdfUrl` |
| A7 migrate script | `pnpm db:migrate` runs locally without error |
| All auth + drawings | `auth.spec.ts`, `drawings.spec.ts` — each asserts not-500 |

## Out of scope

- Real DWG round-trip correctness (LibreDWG quirks on complex files) — the
  suite uses minimal fixtures; deep fidelity testing is separate.
- Multi-layout PDF export (dropped per prior decision).
- Defensive-cleanup items from the prior spec (`screenToWcs`, legend block
  cell) — those remain in `2026-06-19-defensive-cleanup-design.md`,
  unimplemented, and are orthogonal to deployment. They can be done in the
  same push or separately.
- Performance/load testing.
- Coolify-version-specific Traefik label syntax (decided at implementation
  time against the live Coolify).

## Files touched

```
app/apps/web/docker-entrypoint.sh                    # A1: .js → .ts
app/apps/web/nuxt.config.ts                          # A2: webInternalUrl
docker-compose.yml                                   # A2, A5: env + labels
app/apps/web/server/api/drawings/[id]/finalize.post.ts   # A2: callback
app/apps/web/server/plugins/01.storage.ts            # A3 (new)
app/apps/web/server/utils/storage.ts                 # (ensureBucket already exists)
app/apps/web/server/api/health.get.ts                # A4: rustfs probe
app/apps/web/package.json                            # A6 (rm pdf dep), A7 (migrate script), e2e scripts
app/apps/web/app/composables/useExport.ts            # A6: drop pdfUrl
app/apps/web/app/pages/drawings/[id]/preview.vue     # A6: rm pdf branch
app/apps/web/server/api/drawings/[id]/export/pdf.post.ts  # A6 (delete)
app/apps/web/server/api/drawings/[id]/export.post.ts # A6: drop pdfUrl return
app/apps/web/playwright.config.ts                    # B (new)
app/apps/web/.env.e2e                                # B (new)
app/apps/web/docker-compose.e2e.yml                  # B (new)
app/apps/web/e2e/*.spec.ts                           # B (new: 6 files)
app/apps/web/e2e/fixtures/*.{dxf,dwg}                # B (new)
app/apps/web/e2e/helpers/{auth,db}.ts                # B (new)
CHANGELOG.md
GUIDE.md
app/DEPLOY.md                                        # healthchecks table, PDF note
```
