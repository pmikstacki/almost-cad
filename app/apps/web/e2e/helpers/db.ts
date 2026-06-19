/**
 * Direct Postgres access for the e2e suite — used to reset state between
 * specs (the DB is shared across the serial test run) and to create fixtures
 * without going through the HTTP API.
 *
 * Connects to the e2e Postgres (port 5433). Node 24 strips TS types natively,
 * so this file runs under tsx-less `node --experimental-strip-types` via the
 * Playwright worker.
 */
import { Pool } from 'pg'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://modulecad:modulecad@localhost:5433/modulecad'

const pool = new Pool({ connectionString: DATABASE_URL })

/**
 * Truncate all app + better-auth tables. Called before each spec for
 * deterministic isolation. `CASCADE` handles FK deps; `RESTART IDENTITY`
 * resets sequences. `_migrations` is preserved (we don't want to re-run it).
 */
export async function resetDb(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      module_instances,
      module_templates,
      drawings,
      session,
      account,
      verification,
      "user"
    RESTART IDENTITY CASCADE
  `)
}

/** Run the idempotent migration so the DB schema exists for the run. */
export async function migrate(): Promise<void> {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  // Resolve migration SQL relative to this file (apps/web/e2e/helpers/).
  const here = dirname(fileURLToPath(import.meta.url))
  const sqlPath = join(here, '..', '..', 'database', 'migrations', '0001_init.sql')
  const sql = readFileSync(sqlPath, 'utf-8')
  await pool.query(sql)
}

/** Close the pool at end of run. */
export async function closeDb(): Promise<void> {
  await pool.end()
}

/** Insert a drawing row directly (bypassing the upload flow). */
export async function createDrawing(
  userId: string,
  opts: {
    format?: 'dwg' | 'dxf'
    status?: string
    sourceKey?: string
    dxfKey?: string | null
    fileHash?: string | null
  } = {}
): Promise<{ id: string }> {
  const format = opts.format ?? 'dxf'
  const status = opts.status ?? 'ready'
  const sourceKey = opts.sourceKey ?? `dwg/test-${Date.now()}.dxf`
  const res = await pool.query(
    `INSERT INTO drawings (user_id, original_filename, format, status, source_key, dxf_key, file_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      userId,
      'test.dxf',
      format,
      status,
      sourceKey,
      opts.dxfKey ?? null,
      opts.fileHash ?? null
    ]
  )
  return res.rows[0]
}
