-- Tag-adaptive sections: a section flagged is_tag_adaptive repeats its
-- `tag_item` schema block once per enterprise service_tag at render time.
-- The repeatable item template lives in theme_sections.schema (JSONB);
-- the per-tag content lives in site_section_instances.blocks (JSONB).
ALTER TABLE public.theme_sections
  ADD COLUMN IF NOT EXISTS is_tag_adaptive BOOLEAN NOT NULL DEFAULT FALSE;
