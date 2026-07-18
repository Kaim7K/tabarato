CREATE TABLE IF NOT EXISTS social_page_visits (
  id BIGSERIAL PRIMARY KEY,
  visitor_id UUID NOT NULL REFERENCES site_visitors(visitor_id) ON DELETE CASCADE,
  visit_day DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visitor_id, visit_day)
);

CREATE INDEX IF NOT EXISTS idx_social_page_visits_day
ON social_page_visits (visit_day DESC);
