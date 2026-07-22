ALTER TABLE telegram_offers
ADD COLUMN IF NOT EXISTS intelligence_evidence JSONB NOT NULL DEFAULT '{}'::jsonb;
