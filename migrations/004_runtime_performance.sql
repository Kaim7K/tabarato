CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION immutable_unaccent(value TEXT)
RETURNS TEXT AS $$
  SELECT public.unaccent('public.unaccent', value)
$$ LANGUAGE SQL IMMUTABLE PARALLEL SAFE STRICT;

CREATE INDEX IF NOT EXISTS idx_public_offers_recent
ON telegram_offers ((COALESCE(published_at, updated_at, created_at)) DESC)
WHERE status='PUBLICADO';

CREATE INDEX IF NOT EXISTS idx_public_offers_category_recent
ON telegram_offers (category, (COALESCE(published_at, updated_at, created_at)) DESC)
WHERE status='PUBLICADO';

CREATE INDEX IF NOT EXISTS idx_public_offers_platform_recent
ON telegram_offers (platform, (COALESCE(published_at, updated_at, created_at)) DESC)
WHERE status='PUBLICADO';

CREATE INDEX IF NOT EXISTS idx_public_offers_clicks
ON telegram_offers (clicks DESC, (COALESCE(published_at, updated_at, created_at)) DESC)
WHERE status='PUBLICADO';

CREATE INDEX IF NOT EXISTS idx_telegram_offers_source_lookup
ON telegram_offers (LOWER(platform), UPPER(REPLACE(source_product_id, '-', '')))
WHERE source_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_public_offers_search
ON telegram_offers USING GIN (
  immutable_unaccent(
    product_name || ' ' || COALESCE(short_description, '') || ' ' || category || ' ' || platform
  ) gin_trgm_ops
)
WHERE status='PUBLICADO';

CREATE TABLE IF NOT EXISTS app_schema_meta (
  schema_key TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_schema_meta (schema_key, version, updated_at)
VALUES ('main', 3, NOW())
ON CONFLICT (schema_key)
DO UPDATE SET version=EXCLUDED.version, updated_at=EXCLUDED.updated_at;
