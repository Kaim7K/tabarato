CREATE TABLE IF NOT EXISTS social_page_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title TEXT NOT NULL DEFAULT 'Escolha onde receber os achadinhos',
  bio TEXT NOT NULL DEFAULT 'Ofertas, descontos e promocoes em um so lugar.',
  avatar_url TEXT,
  accent_color TEXT NOT NULL DEFAULT '#FF5A1F',
  background_color TEXT NOT NULL DEFAULT '#FFF9F5',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO social_page_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS social_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  icon_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT NOT NULL DEFAULT '#16A34A';
ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS eyebrow TEXT NOT NULL DEFAULT 'TA BARATO';
ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS mascot_url TEXT;
ALTER TABLE social_page_settings ADD COLUMN IF NOT EXISTS background_image_url TEXT;

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
