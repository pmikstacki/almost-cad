-- moduleCad initial schema migration
-- Run with: pnpm db:migrate (or the web container's entrypoint at boot).
--
-- This covers:
--   1. better-auth tables (user, session, account, verification)
--   2. moduleCad app tables (drawings, module_templates, module_instances)
--
-- IMPORTANT: better-auth v1.6.x queries its tables with CAMELCASE column
-- names by default (emailVerified, createdAt, userId, ...). Postgres FOLDS
-- unquoted identifiers to lowercase, so every camelCase column below is
-- DOUBLE-QUOTED to preserve its case — otherwise Postgres stores
-- "emailverified" and better-auth's quoted "emailVerified" misses it,
-- throwing 'column "emailVerified" of relation "user" does not exist'.
-- Field names are the authoritative defaults from
-- @better-auth/core/dist/db/get-tables.mjs. The moduleCad APP tables use
-- snake_case (our own SQL), and reference the unchanged user(id) PK.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- better-auth core tables (camelCase columns, double-quoted — DO NOT change)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "token"       TEXT NOT NULL UNIQUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress"   TEXT,
  "userAgent"   TEXT
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON "session"("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "accessTokenExpiresAt"  TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  "scope"                 TEXT,
  "idToken"               TEXT,
  "password"              TEXT,
  "createdAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_providerId_accountId_idx
  ON "account"("providerId", "accountId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id"          TEXT PRIMARY KEY,
  "identifier"  TEXT NOT NULL,
  "value"       TEXT NOT NULL,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
