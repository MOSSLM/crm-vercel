-- Site builder templates + "LM Déployé" pipeline stage.
--
-- 1) Flag a site builder site as a reusable template. Company sites are cloned
--    from a template (site_config + style_guide + sitemap + instances).
-- 2) Insert the "LM Déployé" stage right after "Qualifié" (ordre 2) in every
--    pipeline that has "Qualifié" and lacks it. Streak Mars/Avril already has
--    it; Agent SAMA (no "Qualifié") is skipped.
--
-- Already applied to the remote project via Supabase MCP apply_migration
-- (migration: add_is_template_and_lm_deploye_stage). Kept here for record.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT DISTINCT e.pipeline_id
    FROM public.etapes_pipeline e
    WHERE lower(e.nom) = 'qualifié'
      AND NOT EXISTS (
        SELECT 1 FROM public.etapes_pipeline x
        WHERE x.pipeline_id = e.pipeline_id AND lower(x.nom) = 'lm déployé'
      )
  LOOP
    -- Sequential pipelines (ordre 1,2,3,...) need ordre 2 freed up. Shift via a
    -- temporary +1000 offset so the (pipeline_id, ordre) unique index never sees
    -- a transient collision during the bulk increment. Gap-style pipelines
    -- (Qualifié=1, next=10) skip this branch and insert at 2 directly.
    IF EXISTS (
      SELECT 1 FROM public.etapes_pipeline
      WHERE pipeline_id = p.pipeline_id AND ordre = 2
    ) THEN
      UPDATE public.etapes_pipeline
        SET ordre = ordre + 1000
        WHERE pipeline_id = p.pipeline_id AND ordre >= 2;
      UPDATE public.etapes_pipeline
        SET ordre = ordre - 999
        WHERE pipeline_id = p.pipeline_id AND ordre >= 1002;
    END IF;
    INSERT INTO public.etapes_pipeline (pipeline_id, nom, ordre)
    VALUES (p.pipeline_id, 'LM Déployé', 2);
  END LOOP;
END $$;
