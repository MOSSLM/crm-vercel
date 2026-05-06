-- Theme Sections Library
-- Stores reusable TSX section components for each theme (Relume nomenclature)

CREATE TABLE IF NOT EXISTS theme_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_slug TEXT NOT NULL,
  section_id TEXT NOT NULL,        -- e.g. "header1", "layout3"
  category TEXT NOT NULL DEFAULT 'misc', -- e.g. "headers", "layouts", "footers"
  name TEXT NOT NULL,              -- e.g. "En-tête avec logo centré"
  code TEXT NOT NULL DEFAULT '',   -- Full TSX component code
  example_data JSONB DEFAULT '{}', -- Sample data for preview
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(theme_slug, section_id)
);

CREATE INDEX IF NOT EXISTS idx_theme_sections_slug ON theme_sections(theme_slug);
CREATE INDEX IF NOT EXISTS idx_theme_sections_category ON theme_sections(theme_slug, category);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_theme_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS theme_sections_updated_at ON theme_sections;
CREATE TRIGGER theme_sections_updated_at
  BEFORE UPDATE ON theme_sections
  FOR EACH ROW EXECUTE FUNCTION update_theme_sections_updated_at();

-- RLS (open for service role, restrict for anon)
ALTER TABLE theme_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON theme_sections;
CREATE POLICY "Service role full access" ON theme_sections
  FOR ALL USING (true);
