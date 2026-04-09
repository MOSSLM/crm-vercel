-- Migration: Add logo_url to entreprises and sync from lead_magnet_projects
-- Date: 2026-04-09

-- 1. Add logo_url column to entreprises
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS logo_url text NULL;

-- 2. Trigger function: sync logo_url from lead_magnet_projects → entreprises
CREATE OR REPLACE FUNCTION sync_logo_url_from_lm_project()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entreprise_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.logo_url IS DISTINCT FROM OLD.logo_url) THEN
    UPDATE public.entreprises
    SET logo_url = NEW.logo_url, updated_at = now()
    WHERE id = NEW.entreprise_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger on lead_magnet_projects
DROP TRIGGER IF EXISTS trg_sync_logo_url_to_entreprise ON public.lead_magnet_projects;
CREATE TRIGGER trg_sync_logo_url_to_entreprise
  AFTER INSERT OR UPDATE OF logo_url ON public.lead_magnet_projects
  FOR EACH ROW EXECUTE FUNCTION sync_logo_url_from_lm_project();

-- 4. Backfill: copy existing logos to entreprises
UPDATE public.entreprises e
SET logo_url = lmp.logo_url, updated_at = now()
FROM public.lead_magnet_projects lmp
WHERE lmp.entreprise_id = e.id
  AND lmp.logo_url IS NOT NULL
  AND e.logo_url IS NULL;
