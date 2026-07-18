import pg from "pg";

const { Pool } = pg;

let pool;
let schemaReady;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_URL or DATABASE_URL is not configured.");
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function query(text, params = []) {
  await ensureSchema();
  return getPool().query(text, params);
}

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS unaccent;

      CREATE TABLE IF NOT EXISTS telegram_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_name TEXT NOT NULL,
        short_description TEXT,
        current_price NUMERIC(12, 2) NOT NULL,
        previous_price NUMERIC(12, 2),
        coupon TEXT,
        coupon_discount_percent NUMERIC(5, 2),
        category TEXT NOT NULL,
        image_url TEXT,
        affiliate_link TEXT NOT NULL,
        platform TEXT NOT NULL,
        source_product_id TEXT,
        product_key TEXT,
        availability_status TEXT NOT NULL DEFAULT 'DESCONHECIDO',
        last_checked_at TIMESTAMPTZ,
        last_check_error TEXT,
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

      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS shares INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS favorites INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS source_product_id TEXT;
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS product_key TEXT;
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS coupon_discount_percent NUMERIC(5, 2);
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'DESCONHECIDO';
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS last_check_error TEXT;
      ALTER TABLE telegram_offers ALTER COLUMN short_description DROP NOT NULL;

      CREATE TABLE IF NOT EXISTS site_visitors (
        visitor_id UUID PRIMARY KEY,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS site_visits (
        id BIGSERIAL PRIMARY KEY,
        visitor_id UUID NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
        visit_day DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (visitor_id, visit_day)
      );

      CREATE TABLE IF NOT EXISTS social_page_visits (
        id BIGSERIAL PRIMARY KEY,
        visitor_id UUID NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
        visit_day DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (visitor_id, visit_day)
      );

      CREATE INDEX IF NOT EXISTS idx_social_page_visits_day
      ON social_page_visits (visit_day DESC);

      CREATE TABLE IF NOT EXISTS site_analytics_events (
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        offer_id UUID REFERENCES telegram_offers(id) ON DELETE CASCADE,
        visitor_id UUID NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
        event_day DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (event_type, offer_id, visitor_id, event_day)
      );

      CREATE INDEX IF NOT EXISTS idx_site_analytics_events_offer
      ON site_analytics_events (offer_id, event_type);

      CREATE TABLE IF NOT EXISTS social_page_settings (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        title TEXT NOT NULL DEFAULT 'Escolha onde receber os achadinhos',
        bio TEXT NOT NULL DEFAULT 'Ofertas, descontos e promocoes em um so lugar.',
        avatar_url TEXT,
        accent_color TEXT NOT NULL DEFAULT '#FF6B35',
        background_color TEXT NOT NULL DEFAULT '#F4F5F6',
        secondary_color TEXT NOT NULL DEFAULT '#16A34A',
        eyebrow TEXT NOT NULL DEFAULT 'TA BARATO',
        mascot_url TEXT,
        background_image_url TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT NOT NULL DEFAULT '#16A34A';
      ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS eyebrow TEXT NOT NULL DEFAULT 'TA BARATO';
      ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS mascot_url TEXT;
      ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS background_image_url TEXT;

      INSERT INTO social_page_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS social_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        icon_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS subtitle TEXT;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'button';
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS icon_name TEXT;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS background_image_url TEXT;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS badge TEXT;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS open_new_tab BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
      ALTER TABLE social_links ADD COLUMN IF NOT EXISTS style_config JSONB NOT NULL DEFAULT '{}'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_social_links_publication
      ON social_links (is_active, starts_at, ends_at, sort_order);

      CREATE TABLE IF NOT EXISTS site_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      INSERT INTO site_categories (name, slug, is_default) VALUES
        ('Casa e organização', 'casa-e-organizacao', TRUE),
        ('Tecnologia', 'tecnologia', TRUE),
        ('Escritório', 'escritorio', TRUE),
        ('Ferramentas', 'ferramentas', TRUE),
        ('Cozinha', 'cozinha', TRUE),
        ('Beleza e cuidados', 'beleza-e-cuidados', TRUE)
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, is_default=TRUE;

      CREATE TABLE IF NOT EXISTS offer_price_history (
        id BIGSERIAL PRIMARY KEY,
        offer_id UUID NOT NULL REFERENCES telegram_offers(id) ON DELETE CASCADE,
        price NUMERIC(12, 2) NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS offer_publication_history (
        id BIGSERIAL PRIMARY KEY,
        offer_id UUID NOT NULL REFERENCES telegram_offers(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        external_message_id TEXT,
        error_message TEXT,
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_offer_publication_history_offer_date
      ON offer_publication_history (offer_id, published_at DESC);

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

      ALTER TABLE telegram_auto_messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'TELEGRAM';
      ALTER TABLE telegram_auto_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE telegram_auto_messages ADD COLUMN IF NOT EXISTS whatsapp_group TEXT;

      CREATE INDEX IF NOT EXISTS idx_telegram_auto_messages_due ON telegram_auto_messages (is_active, next_send_at, sort_order);
      CREATE INDEX IF NOT EXISTS idx_auto_messages_channel_due ON telegram_auto_messages (channel, is_active, next_send_at, sort_order);

      CREATE INDEX IF NOT EXISTS idx_telegram_offers_status ON telegram_offers (status);
      CREATE INDEX IF NOT EXISTS idx_telegram_offers_scheduled_at ON telegram_offers (scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_telegram_offers_created_at ON telegram_offers (created_at);
      CREATE INDEX IF NOT EXISTS idx_telegram_offers_category ON telegram_offers (category);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_offers_unique_product_price
      ON telegram_offers (product_key, current_price)
      WHERE product_key IS NOT NULL;

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
    `).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
