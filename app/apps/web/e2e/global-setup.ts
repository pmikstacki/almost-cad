/**
 * Playwright global setup — runs once before the suite.
 *
 * The e2e Postgres starts on tmpfs (empty) every `up`. The dev server
 * (nuxt dev) does NOT run the container entrypoint migration, so we apply
 * the schema here directly. This mirrors what the prod container's
 * docker-entrypoint.sh + migrate.ts do at boot.
 *
 * Idempotent (CREATE TABLE IF NOT EXISTS) so re-runs are safe.
 */
import { migrate, closeDb } from './helpers/db'

export default async function globalSetup() {
  console.log('[global-setup] applying migrations to e2e Postgres...')
  await migrate()
  await closeDb()
  console.log('[global-setup] migrations applied')
}
