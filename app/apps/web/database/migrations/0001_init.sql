-- moduleCad initial schema migration
-- Run with: psql "$DATABASE_URL" -f 0001_init.sql
-- (or `pnpm db:migrate` once tools/run-migration.mjs is wired in Phase 2)
--
-- This covers:
--   1. better-auth tables (user, session, account, verification)
--   2. moduleCad app tables (drawings, module_templates, module_instances)
--
-- better-auth manages its own tables but is happy sharing a database with
-- our app data. Names/types follow better-auth's documented Postgres schema.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- better-auth core tables
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user" (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address  TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"(user_id);

CREATE TABLE IF NOT EXISTS "account" (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL,
  provider_id     TEXT NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope           TEXT,
  id_token        TEXT,
  password        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_idx
  ON "account"(provider_id, account_id);

CREATE TABLE IF NOT EXISTS "verification" (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────
-- moduleCad app tables
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drawings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  format            TEXT NOT NULL CHECK (format IN ('dwg','dxf')),
  status            TEXT NOT NULL DEFAULT 'uploaded'
                    CHECK (status IN ('uploaded','processing','ready','error')),
  source_key        TEXT NOT NULL,        -- RustFS object key of the original
  dxf_key           TEXT,                 -- RustFS object key of converted DXF (DWG only)
  file_hash         TEXT,                 -- content hash for content-addressed cache
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS drawings_user_id_idx ON drawings(user_id);
CREATE INDEX IF NOT EXISTS drawings_file_hash_idx ON drawings(file_hash);

-- Reusable sheet standards (paper size, margins, logo slots, legend schema).
-- The JSON columns mirror the @modulecad/modules ModuleTemplate interface.
CREATE TABLE IF NOT EXISTS module_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  paper_size              TEXT NOT NULL,
  orientation             TEXT NOT NULL CHECK (orientation IN ('portrait','landscape')),
  viewport_ratio          JSONB NOT NULL,
  margins                 JSONB NOT NULL,
  title_fields            JSONB NOT NULL DEFAULT '[]',
  logo_slots              JSONB NOT NULL DEFAULT '[]',
  legend_columns          JSONB NOT NULL DEFAULT '[]',
  legend_default_filters  JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS module_templates_user_id_idx ON module_templates(user_id);

-- Per-drawing module instances.
CREATE TABLE IF NOT EXISTS module_instances (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id                UUID NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
  template_id               UUID NOT NULL REFERENCES module_templates(id),
  name                      TEXT NOT NULL,
  boundary_polygon          JSONB NOT NULL,  -- [{x,y}, ...] in model-space WCS
  viewport_zoom_padding     REAL NOT NULL DEFAULT 0,
  legend_filter_overrides   JSONB NOT NULL DEFAULT '{}',
  logo_overrides            JSONB NOT NULL DEFAULT '{}',
  title_field_values        JSONB NOT NULL DEFAULT '{}',
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS module_instances_drawing_id_idx ON module_instances(drawing_id);

COMMIT;
