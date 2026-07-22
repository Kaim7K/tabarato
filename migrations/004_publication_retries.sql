ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS site_published_at TIMESTAMPTZ;
ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS telegram_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS telegram_next_retry_at TIMESTAMPTZ;
ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS telegram_last_error_code TEXT;

UPDATE telegram_offers
SET site_published_at = COALESCE(site_published_at, published_at)
WHERE status = 'PUBLICADO' AND site_published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_offers_telegram_retry
ON telegram_offers (telegram_next_retry_at)
WHERE telegram_next_retry_at IS NOT NULL;
