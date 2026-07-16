CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS telegram_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  short_description TEXT NOT NULL,
  current_price NUMERIC(12, 2) NOT NULL,
  previous_price NUMERIC(12, 2),
  coupon TEXT,
  category TEXT NOT NULL,
  image_url TEXT,
  affiliate_link TEXT NOT NULL,
  platform TEXT NOT NULL,
  extra_text TEXT,
  status TEXT NOT NULL DEFAULT 'RASCUNHO',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  telegram_message_id TEXT,
  telegram_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_offers_status_check CHECK (
    status IN ('RASCUNHO', 'APROVADO', 'AGENDADO', 'PUBLICANDO', 'PUBLICADO', 'ERRO', 'EXPIRADO')
  )
);

CREATE INDEX IF NOT EXISTS idx_telegram_offers_status ON telegram_offers (status);
CREATE INDEX IF NOT EXISTS idx_telegram_offers_scheduled_at ON telegram_offers (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_telegram_offers_created_at ON telegram_offers (created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_offers_category ON telegram_offers (category);

CREATE OR REPLACE FUNCTION set_telegram_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telegram_offers_updated_at ON telegram_offers;
CREATE TRIGGER trg_telegram_offers_updated_at
BEFORE UPDATE ON telegram_offers
FOR EACH ROW
EXECUTE FUNCTION set_telegram_offers_updated_at();
