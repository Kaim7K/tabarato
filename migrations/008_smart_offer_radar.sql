CREATE INDEX IF NOT EXISTS idx_telegram_offers_queue_score_inputs
ON telegram_offers (status, priority, updated_at DESC);

ALTER TABLE offer_publication_history ADD COLUMN IF NOT EXISTS price_snapshot NUMERIC(12, 2);
ALTER TABLE offer_publication_history ADD COLUMN IF NOT EXISTS coupon_snapshot TEXT;
ALTER TABLE offer_publication_history ADD COLUMN IF NOT EXISTS free_shipping_snapshot BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_offer_publication_history_success_recent
ON offer_publication_history (offer_id, published_at DESC)
WHERE status = 'SUCESSO';

CREATE INDEX IF NOT EXISTS idx_offer_price_history_offer_price_recent
ON offer_price_history (offer_id, recorded_at DESC, price);
