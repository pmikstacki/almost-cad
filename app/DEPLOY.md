# Deploying moduleCad on Coolify

This guide covers deploying the full four-service stack (web, RustFS,
Postgres, dwg-converter) on a single Coolify server.

## Prerequisites

- A [Coolify](https://coolify.io) v4 instance with the default Traefik proxy.
- A server with at least 4 GB RAM (LibreDWG builds are memory-hungry; the
  built image reuses a layer cache afterwards).
- Two DNS A/AAAA records pointing at the server:
  - `cad.example.com` → the web app
  - `cdn.example.com` → RustFS (browser presigned uploads/downloads)
- Ports 80 + 443 open for Let's Encrypt HTTP-01 challenges.

## Step 1 — Create the application in Coolify

1. **New Resource → Application → Docker Compose build pack**, pointed at
   this repo's `docker-compose.yml` (at the repo root).
2. Coolify auto-detects the compose file and offers per-service build toggles.
   Leave **Build from repo** on for `web` and `dwg-converter`; `postgres` and
   `rustfs` use prebuilt images.

## Step 2 — Assign FQDNs

In the Coolify resource UI:

- `web` service → Domains: `https://cad.example.com`
- `rustfs` service → Domains: `https://cdn.example.com`
- `postgres`, `dwg-converter` → leave blank (internal only).

Coolify injects these as `SERVICE_FQDN_WEB` and `SERVICE_FQDN_RUSTFS` env
vars, plus `COOLIFY_FQDN` on `web`. SSL certs are issued automatically via
Let's Encrypt HTTP-01.

## Step 3 — Set secrets (per-resource env editor)

Create these in the Coolify environment editor. Mark sensitive ones as
**secret** (hidden in logs/UI):

| Variable | Where | Example / how to generate |
|---|---|---|
| `POSTGRES_PASSWORD` | (compose-level) | `openssl rand -base64 24` |
| `RUSTFS_ACCESS_KEY` | (compose-level) | `modulecad` (or a random id) |
| `RUSTFS_SECRET_KEY` | (compose-level) | `openssl rand -base64 32` |
| `BETTER_AUTH_SECRET` | (compose-level) | `openssl rand -base64 32` |
| `DWG_CONVERTER_SECRET` | (compose-level) | `openssl rand -base64 32` |

> Coolify's per-resource env editor supports a raw `.env` view — paste the
> block above there. `${VAR}` substitution in `docker-compose.yml` resolves
> these into each service.

## Step 4 — Persistent storage

The compose file bind-mounts RustFS data to `/srv/rustfs/data` on the host
and uses a named volume `pgdata` for Postgres. Ensure `/srv/rustfs/data`
exists on the host before the first deploy:

```bash
ssh your-server
sudo mkdir -p /srv/rustfs/data
sudo chown 1000:1000 /srv/rustfs/data   # adjust to the container UID
```

> ⚠️ Coolify named-volume recreation has known bugs (#5099, #5589). The
> bind mount for RustFS sidesteps this. **Do not** rely on Coolify's volume
> lifecycle for irreplaceable object data.

## Step 5 — Run the DB migration

On first deploy (and after schema changes), run the migration. From the
server host:

```bash
docker compose -f <coolify compose path> exec web \
  node -e "fetch('http://localhost:3000/api/health').then(r=>r.json()).then(console.log)"
# Then run the SQL migration against the postgres service:
docker compose -f <coolify compose path> exec -T postgres \
  psql -U modulecad -d modulecad < apps/web/database/migrations/0001_init.sql
```

(Phase 7.1 will wire a proper `pnpm db:migrate` task that the web container
runs as an entrypoint pre-start hook.)

## Step 6 — Deploy

Click **Deploy** in Coolify. The first build compiles LibreDWG from source
(~10–15 min); subsequent builds use the layer cache.

## Traefik buffering & SSE

The `web` service carries Traefik labels (`coolify.proxy=true`) defining a
`modulecad-sse-nobuffer` middleware that disables request/response buffering.
This is required for `/api/jobs/:id/events` (Server-Sent Events) — Coolify's
default buffering middleware would otherwise close SSE streams. Browser
uploads bypass the web service entirely (presigned direct-to-RustFS), so
body-size limits on `web` are not a concern.

## Backups

- **Postgres (`pgdata`):** use Coolify's built-in PostgreSQL backup schedule,
  or run `pg_dump` on a cron:
  ```bash
  docker compose exec -T postgres pg_dump -U modulecad modulecad | \
    gzip > /backups/modulecad-pg-$(date +%F).sql.gz
  ```
- **RustFS (`/srv/rustfs/data`):** the bind mount makes this a plain
  directory — back it up with `restic` or `rclone` on a cron:
  ```bash
  restic backup /srv/rustfs/data
  ```

Both should run at least daily. Object data is content-addressed and
immutable, so incremental backups deduplicate well.

## Operations cheat-sheet

```bash
# Tail logs (all services)
docker compose logs -f

# Restart just the converter (e.g. after a LibreDWG upgrade)
docker compose restart dwg-converter

# Rebuild + redeploy after a code push
# → Coolify auto-deploys on push to main (GitHub App). Manual: click Deploy.

# Run a psql session
docker compose exec postgres psql -U modulecad -d modulecad
```

## Healthchecks

| Service | Check |
|---|---|
| `web` | `GET /api/health` → 200 with `{ status: 'ok', db: 'up', rustfs: 'up' }` (503 if either Postgres or RustFS is down) |
| `dwg-converter` | `GET /health` → 200 with `{ status: 'ok', tools: {...} }` |
| `postgres` | `pg_isready -U modulecad` |
| `rustfs` | S3 liveness via the `web` health check (`ListBuckets`) — no separate RustFS health endpoint is exposed; the `web` container's `/api/health` is the source of truth. |

Coolify uses these to gate deploy success and restart unhealthy containers.

The `web` `/api/health` route probes both Postgres (`SELECT 1`) and RustFS
(S3 `ListBuckets`) on every call. A boot plugin (`server/plugins/01.storage.ts`)
also ensures the RustFS bucket exists before the first request, so a fresh
RustFS deployment does not 404 the first presigned upload.

## End-to-end tests

The Playwright e2e suite (`app/apps/web/e2e/`) exercises the full stack
against real Postgres (tmpfs → unmigrated every run) + RustFS +
dwg-converter via `podman compose`:

```
cd app/apps/web
pnpm test:e2e:full   # up → migrate → test → down
```

Requires podman with the `applehv`/`kvm` machine running and ~10GB free
disk (the dwg-converter image builds LibreDWG from source). See
`docker-compose.e2e.yml` and `playwright.config.ts`. The suite reproduces
the prod failure modes (unmigrated DB, missing bucket, callback wiring)
that static checks miss.

