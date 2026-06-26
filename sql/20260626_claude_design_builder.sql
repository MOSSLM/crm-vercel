-- Claude Design Builder — additive data model.
--
-- A second, dedicated builder for multi-page "Claude Design" exports. It reuses
-- the existing site-builder backend (raw whole-page sections, variable
-- resolution, deploy-batch, multi-tenant hosting); this migration only adds the
-- columns that layer needs. No new tables: a multi-page design is stored as N
-- `theme_sections` (render_mode='raw') + 1 `sites` row (is_template) + N
-- `site_section_instances` (one per page_slug).
--
-- All changes are additive (ADD COLUMN IF NOT EXISTS) so re-running is a no-op.
-- RLS is already enabled on these tables; new columns inherit it.

begin;

-- ---------------------------------------------------------------------------
-- entreprises.horaires — opening hours, injected as {{ entreprise.horaires }}.
-- The token is already referenced as a preview default in
-- LibrarySectionIframe.tsx but the column did not exist, so the resolver had
-- nothing to read. Plain free text (e.g. "Lun–Ven 8h–18h · Sam sur RDV").
-- ---------------------------------------------------------------------------
ALTER TABLE public.entreprises
  ADD COLUMN IF NOT EXISTS horaires TEXT;

-- ---------------------------------------------------------------------------
-- sites.build_stage — the 4 kanban columns of the projects board. TEXT + CHECK
-- (not a PG enum) matches the repo's lighter style and lets us reorder/rename
-- stages without ALTER TYPE. A freshly drag-created demo lands in 'a_faire'.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS build_stage TEXT NOT NULL DEFAULT 'a_faire';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'sites' AND constraint_name = 'sites_build_stage_check'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_build_stage_check
      CHECK (build_stage IN ('a_faire', 'en_cours', 'a_verifier', 'pret'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- sites.is_claude_design — marks a multi-page Claude Design site so the new
-- builder/kanban list ONLY these and route them to the dedicated editor,
-- keeping the legacy single-HTML imports and section-based sites separate.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS is_claude_design BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- sites.tweaks — resolved theme of a Claude design (the template's own
-- `cvc-theme` shape: fond/fondAlt/sable/sombre/accent/accentChaud/police/
-- epaisseur/angles + per-page extras like stepperStyle/proStyle). Seeded from
-- the parsed /*EDITMODE*/ defaults on import, edited in the Tweaks panel, and
-- applied at render as CSS vars + a seeded cvc-theme so theme-apply.js
-- reproduces it with no flash.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS tweaks JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- sites.shared_assets — the design's shared stylesheet + font links, stored
-- once on the site instead of duplicating ~75 KB of CSS into every page's
-- theme_sections.code. Shape: { css: "<styles.css + theme-tokens.css, image
-- paths rewritten>", fonts: ["<google/leaflet link hrefs>"] }. Injected once
-- per page by the renderer.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS shared_assets JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Snapshot columns: publishSite copies the live theme/assets so the public
-- site serves them from the locked snapshot (consistent with the strict
-- snapshot lock used for variables/instances).
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS published_tweaks JSONB;
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS published_shared_assets JSONB;

-- ---------------------------------------------------------------------------
-- site_builder_assets.original_path — the template-relative path
-- ("images/clim-gainable.png") of an uploaded asset, so HTML rewriting and
-- re-import diffing can map original → public URL deterministically.
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_builder_assets
  ADD COLUMN IF NOT EXISTS original_path TEXT;

-- Fast lookup of Claude-design sites for the new builder list / kanban.
CREATE INDEX IF NOT EXISTS idx_sites_claude_design_stage
  ON public.sites (is_claude_design, build_stage);

commit;
