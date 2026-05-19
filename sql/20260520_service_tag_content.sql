-- Adaptive per-service-tag content for site builder sections.
--
-- Companies declare their offered services in `entreprises.service_tags` (JSONB
-- array of strings). Section components (e.g. tabs, service grids) consume a
-- merged data structure built from:
--   1) `service_tag_defaults`           — global defaults editable in admin
--   2) `sites.content_overrides`        — per-site overrides (optional)
--   3) `entreprises.stats`              — per-enterprise key figures
--
-- The renderer filters defaults by the active enterprise's service_tags so the
-- same theme works for any company by simply changing the tags.

-- ---------------------------------------------------------------------------
-- 1. Global per-tag content defaults
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_tag_defaults (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_tag             TEXT NOT NULL UNIQUE,
  slug                    TEXT NOT NULL UNIQUE,
  display_label           TEXT,
  icon                    TEXT,
  display_order           INTEGER NOT NULL DEFAULT 100,

  headline_template       TEXT,
  subheadline_template    TEXT,
  description_template    TEXT,
  trust_title_template    TEXT,

  image_url               TEXT,
  cta_label               TEXT,
  cta_href                TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_tag_defaults_slug
  ON service_tag_defaults (slug);
CREATE INDEX IF NOT EXISTS idx_service_tag_defaults_order
  ON service_tag_defaults (display_order);

CREATE OR REPLACE FUNCTION service_tag_defaults_set_updated_at()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_tag_defaults_updated_at ON service_tag_defaults;
CREATE TRIGGER trg_service_tag_defaults_updated_at
  BEFORE UPDATE ON service_tag_defaults
  FOR EACH ROW
  EXECUTE FUNCTION service_tag_defaults_set_updated_at();

ALTER TABLE service_tag_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read service_tag_defaults"
  ON service_tag_defaults FOR SELECT
  USING (true);

CREATE POLICY "Authenticated insert service_tag_defaults"
  ON service_tag_defaults FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated update service_tag_defaults"
  ON service_tag_defaults FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated delete service_tag_defaults"
  ON service_tag_defaults FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 2. Per-enterprise key figures
-- ---------------------------------------------------------------------------
-- Shape: jsonb array of { label: string, value: string, display_order?: number }
ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Per-site content overrides
-- ---------------------------------------------------------------------------
-- Shape:
-- {
--   "services": {
--     "<tag-slug>": { "headline": "...", "image_url": "...", "is_active": false, ... }
--   },
--   "stats": [ { "label": "...", "value": "..." } ]   -- overrides entreprise.stats
-- }
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS content_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
