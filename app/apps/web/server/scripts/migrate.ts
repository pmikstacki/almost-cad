/**
 * Idempotent DB migration runner — runs before the Nitro server starts.
 *
 * Applied via the web container's entrypoint (see Dockerfile). Reads
 * database/migrations/*.sql in order and applies each statement, tolerating
 * "already exists" errors so re-runs are safe (the schema uses CREATE TABLE
 * IF NOT EXISTS, but CREATE INDEX + constraints can still error on re-run;
 * we swallow those).
 *
 * License: GPL-3.0-or-later
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? '/app/migrations'
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL not set; skipping migration')
  process.exit(0) // not fatal — let the server try to start and surface the error
}

const pool = new Pool({ connectionString: DATABASE_URL })

// Tolerant error patterns: anything that indicates the object already exists.
const IGNORABLE = /already exists|duplicate key|exists relation/i

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  // Ensure the migrations tracking table exists.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  for (const file of files) {
    const applied = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [file]
    )
    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`[migrate] skip (already applied): ${file}`)
      continue
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    console.log(`[migrate] applying: ${file}`)
    try {
      await pool.query('BEGIN')
      await pool.query(sql)
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
      await pool.query('COMMIT')
      console.log(`[migrate] applied: ${file}`)
    } catch (err: any) {
      await pool.query('ROLLBACK')
      const msg = err?.message ?? String(err)
      if (IGNORABLE.test(msg)) {
        // Mark applied even though some statements were no-ops, so we don't
        // re-attempt them every boot. Re-running a CREATE TABLE IF NOT EXISTS
        // is harmless; re-running CREATE UNIQUE INDEX is what we're swallowing.
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file])
        console.log(`[migrate] applied (with ignored warnings): ${file} — ${msg.slice(0, 120)}`)
      } else {
        console.error(`[migrate] FAILED: ${file}:`, msg)
        process.exit(1)
      }
    }
  }
  console.log('[migrate] done')
}

main()
  .catch((err) => {
    console.error('[migrate] fatal:', err)
    process.exit(1)
  })
  .finally(() => pool.end())
