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
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT telegram_offers_status_check CHECK (
    status IN ('RASCUNHO', 'APROVADO', 'AGENDADO', 'PUBLICANDO', 'PUBLICADO', 'ERRO', 'EXPIRADO')
  )
);

ALTER TABLE telegram_offers ALTER COLUMN short_description DROP NOT NULL;
ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS shares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS favorites INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS offer_price_history (
  id BIGSERIAL PRIMARY KEY,
  offer_id UUID NOT NULL REFERENCES telegram_offers(id) ON DELETE CASCADE,
  price NUMERIC(12, 2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_price_history_offer_date
ON offer_price_history (offer_id, recorded_at DESC);

INSERT INTO offer_price_history (offer_id, price, recorded_at)
SELECT id, current_price, COALESCE(published_at, created_at)
FROM telegram_offers offer
WHERE NOT EXISTS (SELECT 1 FROM offer_price_history history WHERE history.offer_id = offer.id);

CREATE TABLE IF NOT EXISTS telegram_auto_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  sort_order INTEGER NOT NULL DEFAULT 0,
  next_send_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  telegram_message_id TEXT,
  telegram_response JSONB,
  error_message TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_offers_status ON telegram_offers (status);
CREATE INDEX IF NOT EXISTS idx_telegram_offers_scheduled_at ON telegram_offers (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_telegram_offers_created_at ON telegram_offers (created_at);
CREATE INDEX IF NOT EXISTS idx_telegram_offers_category ON telegram_offers (category);
CREATE INDEX IF NOT EXISTS idx_telegram_auto_messages_due ON telegram_auto_messages (is_active, next_send_at, sort_order);

CREATE OR REPLACE FUNCTION set_telegram_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION record_offer_price()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.current_price IS DISTINCT FROM NEW.current_price THEN
    INSERT INTO offer_price_history (offer_id, price) VALUES (NEW.id, NEW.current_price);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telegram_offers_updated_at ON telegram_offers;
CREATE TRIGGER trg_telegram_offers_updated_at
BEFORE UPDATE ON telegram_offers
FOR EACH ROW
EXECUTE FUNCTION set_telegram_offers_updated_at();

DROP TRIGGER IF EXISTS trg_record_offer_price ON telegram_offers;
CREATE TRIGGER trg_record_offer_price
AFTER INSERT OR UPDATE OF current_price ON telegram_offers
FOR EACH ROW
EXECUTE FUNCTION record_offer_price();

DROP TRIGGER IF EXISTS trg_telegram_auto_messages_updated_at ON telegram_auto_messages;
CREATE TRIGGER trg_telegram_auto_messages_updated_at
BEFORE UPDATE ON telegram_auto_messages
FOR EACH ROW
EXECUTE FUNCTION set_telegram_offers_updated_at();
