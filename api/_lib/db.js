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

      ALTER TABLE telegram_offers ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;

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
    `).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
