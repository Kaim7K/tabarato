CREATE INDEX IF NOT EXISTS idx_telegram_offers_public_recent
ON telegram_offers (COALESCE(published_at, updated_at, created_at) DESC)
WHERE site_published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_offers_public_category_recent
ON telegram_offers (category, COALESCE(published_at, updated_at, created_at) DESC)
WHERE site_published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_offers_public_platform_recent
ON telegram_offers (platform, COALESCE(published_at, updated_at, created_at) DESC)
WHERE site_published_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_offers_public_price
ON telegram_offers (current_price)
WHERE site_published_at IS NOT NULL;
