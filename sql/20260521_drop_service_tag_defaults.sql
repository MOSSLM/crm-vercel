-- Drop the service_tag_defaults table introduced in 20260520_service_tag_content.sql.
-- The new model filters blocks/pages by service_tag on the SectionBlockInstance /
-- SitemapPage records themselves; per-tag content defaults are no longer used.
-- sites.content_overrides and entreprises.stats are kept (stats overrides still used).
DROP TABLE IF EXISTS public.service_tag_defaults CASCADE;
