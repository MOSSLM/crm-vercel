-- Reusable site-builder components (saved element trees)
CREATE TABLE IF NOT EXISTS site_builder_components (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'custom',
  content     TEXT        NOT NULL, -- JSON string of EditorElement
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_site_builder_components_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_builder_components_updated_at
  BEFORE UPDATE ON site_builder_components
  FOR EACH ROW EXECUTE FUNCTION update_site_builder_components_updated_at();
