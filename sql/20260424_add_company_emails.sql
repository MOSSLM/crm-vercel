-- Add email column to entreprises + sync from lead_magnet_projects.override_email

-- 1. Add email column
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS email text NULL;

-- 2. Trigger function: sync override_email from lead_magnet_projects → entreprises
--    Only sets if entreprises.email is currently NULL (manual entries take priority)
CREATE OR REPLACE FUNCTION sync_email_from_lm_project()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entreprise_id IS NOT NULL
     AND NEW.override_email IS NOT NULL
     AND NEW.override_email <> ''
     AND (TG_OP = 'INSERT' OR NEW.override_email IS DISTINCT FROM OLD.override_email) THEN
    UPDATE public.entreprises
    SET email = NEW.override_email, updated_at = now()
    WHERE id = NEW.entreprise_id AND email IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger on lead_magnet_projects
DROP TRIGGER IF EXISTS trg_sync_email_to_entreprise ON public.lead_magnet_projects;
CREATE TRIGGER trg_sync_email_to_entreprise
  AFTER INSERT OR UPDATE OF override_email ON public.lead_magnet_projects
  FOR EACH ROW EXECUTE FUNCTION sync_email_from_lm_project();

-- 4. Backfill: copy override_email from lead_magnet_projects to entreprises where email is NULL
UPDATE public.entreprises e
SET email = lmp.override_email, updated_at = now()
FROM public.lead_magnet_projects lmp
WHERE lmp.entreprise_id = e.id
  AND lmp.override_email IS NOT NULL
  AND lmp.override_email <> ''
  AND e.email IS NULL;
