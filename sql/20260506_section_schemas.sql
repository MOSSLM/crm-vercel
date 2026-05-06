-- ─── Section Schema System ────────────────────────────────────────────────────
-- Adds schema JSONB column to theme_sections for per-section editing schemas (Shopify-like).
-- The color_scheme is stored in site_section_instances.content.__color_scheme (no new column needed).

-- Add schema column to theme_sections (library sections can optionally define their own schema)
ALTER TABLE theme_sections ADD COLUMN IF NOT EXISTS schema JSONB DEFAULT NULL;

COMMENT ON COLUMN theme_sections.schema IS
  'Optional SectionSchema (Shopify-like) defining editable settings for this section. '
  'Built-in section types resolve their schema from the static SECTION_SCHEMAS registry in src/data/section-schemas.ts.';

-- Index for sections that have a schema defined
CREATE INDEX IF NOT EXISTS idx_theme_sections_has_schema
  ON theme_sections ((schema IS NOT NULL));
