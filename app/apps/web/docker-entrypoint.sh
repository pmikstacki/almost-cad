#!/bin/sh
# web container entrypoint: run idempotent DB migrations, then start Nitro.
#
# The migration runner uses DATABASE_URL from the environment and tolerates
# re-runs (tracks applied files in _migrations). If the DB is unreachable it
# exits non-zero so Coolify restarts the container (giving postgres time to
# come up on first boot).
set -e

echo "[entrypoint] running DB migrations..."
node --experimental-strip-types /app/migrate.js

echo "[entrypoint] starting Nitro server..."
exec node /app/.output/server/index.mjs
