-- Fix 1: add missing UNIQUE constraint on lead_magnet_content.lead_magnet_project_id
-- Without this, the trigger ensure_lead_magnet_content_for_project() fails with
-- "42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- which silently breaks every INSERT into opportunites.
ALTER TABLE public.lead_magnet_content
  ADD CONSTRAINT lead_magnet_content_project_unique
  UNIQUE (lead_magnet_project_id);

-- Fix 2: drop broken trigger on lead_magnet_content
-- _create_lead_magnet_snapshot_from_lmc() reads columns (slogan, sub_slogan_text, etc.)
-- that no longer exist in lead_magnet_content after a schema refactor.
DROP TRIGGER IF EXISTS trg_lmc_create_lead_magnet_snapshot ON public.lead_magnet_content;
