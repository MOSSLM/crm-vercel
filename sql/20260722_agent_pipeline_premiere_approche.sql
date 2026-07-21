-- Agent SAMA pipeline: distinguish the first automated/manual outreach
-- (email/WhatsApp) from an actual phone contact.
--   * add "Première approche" (ordre 15) between "Nouveau lead" (10) and
--     "Contacté" (20). The pipeline uses gap ordering (10,20,30,…) so 15 slots
--     in with no ordre collision.
--   * rename "Contacté" → "Contacté (appelé)" to make it mean "the agent called".
-- Idempotent.

begin;

DO $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.pipelines WHERE nom = 'Agent SAMA' LIMIT 1;
  IF pid IS NULL THEN RETURN; END IF;

  UPDATE public.etapes_pipeline
    SET nom = 'Contacté (appelé)'
    WHERE pipeline_id = pid AND nom = 'Contacté';

  IF NOT EXISTS (
    SELECT 1 FROM public.etapes_pipeline
    WHERE pipeline_id = pid AND nom = 'Première approche'
  ) THEN
    INSERT INTO public.etapes_pipeline (pipeline_id, nom, ordre, visible)
    VALUES (pid, 'Première approche', 15, true);
  END IF;
END $$;

commit;
