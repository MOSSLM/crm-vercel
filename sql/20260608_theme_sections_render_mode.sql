-- Render mode for library sections.
-- 'managed' (default): the site builder applies its coherence layer (forced
--   section padding, max-width, color-scheme, and the !important font/radius/CTA
--   rules) so heterogeneous sections share a house style.
-- 'raw': the section renders exactly as its own markup/CSS defines — the builder
--   imposes nothing. Used for imported / hand-designed sections that must stay
--   faithful to their original design.
ALTER TABLE public.theme_sections
  ADD COLUMN IF NOT EXISTS render_mode TEXT NOT NULL DEFAULT 'managed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'theme_sections_render_mode_check'
  ) THEN
    ALTER TABLE public.theme_sections
      ADD CONSTRAINT theme_sections_render_mode_check
      CHECK (render_mode IN ('managed', 'raw'));
  END IF;
END $$;
