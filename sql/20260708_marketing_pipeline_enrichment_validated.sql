-- Marketing & Web production pipeline
-- ---------------------------------------------------------------------------
-- Adds an explicit "enrichment validated" gate to lead-magnet projects so the
-- Marketing & Web pipeline can distinguish:
--   * col 1 "Opportunités"   → enrichment run (pret_pour_lm=true) but NOT yet
--                              reviewed/validated by a human
--   * col 2 "Prêts pour LM"  → enrichment validated, ready to build the site
--
-- `pret_pour_lm` still gates the enrichment edge function (it must be true for
-- the edge function to run), so it can't double as the human-validation flag —
-- hence this dedicated column. The board API degrades gracefully to using
-- `pret_pour_lm` when this column is missing, so applying this migration is
-- what "turns on" the explicit validate step.

ALTER TABLE public.lead_magnet_projects
  ADD COLUMN IF NOT EXISTS enrichment_validated BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing projects that were already flagged ready for LM are considered
-- validated so they don't regress to column 1 after this migration.
UPDATE public.lead_magnet_projects
  SET enrichment_validated = TRUE
  WHERE pret_pour_lm = TRUE;

CREATE INDEX IF NOT EXISTS idx_lmp_enrichment_validated
  ON public.lead_magnet_projects (enrichment_validated)
  WHERE enrichment_validated = TRUE;
