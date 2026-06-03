-- Agent / freelance portal: per-agent ownership, scoped RLS, and a dedicated pipeline.
--
-- Context: freelance agents prospect CVC companies on behalf of SAMA. They must
-- only see/work their own prospects (owner_id = self) plus a shared, unclaimed
-- pool (owner_id IS NULL). Admins keep full access; the staff CRM is unaffected.
--
-- RLS pitfall handled here: opportunites/entreprises had a single "staff only"
-- policy USING (is_staff()) where is_staff() = role IN ('admin','freelance').
-- Postgres OR-combines policies, so merely ADDING a freelance policy would not
-- restrict anything. We therefore NARROW the staff policy to admin-only, then
-- add the freelance own-or-pool policies.

-- 1. Ownership columns (nullable = shared pool) ------------------------------
ALTER TABLE public.opportunites
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.entreprises
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunites_owner_id ON public.opportunites(owner_id);
CREATE INDEX IF NOT EXISTS idx_entreprises_owner_id ON public.entreprises(owner_id);

-- 2. Role helper (mirrors public.is_staff / public.is_admin) -----------------
CREATE OR REPLACE FUNCTION public.is_freelance()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'freelance'
  );
$$;

-- 3. Dedicated "Agent SAMA" pipeline + stages (idempotent) ------------------
INSERT INTO public.pipelines (nom, ordre, visible, is_default)
SELECT 'Agent SAMA', COALESCE((SELECT max(ordre) FROM public.pipelines), 0) + 1, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.pipelines WHERE nom = 'Agent SAMA');

INSERT INTO public.etapes_pipeline (nom, ordre, visible, pipeline_id)
SELECT s.nom, s.ordre, true, p.id
FROM public.pipelines p
CROSS JOIN (VALUES
  ('Nouveau lead', 10),
  ('Contacté',     20),
  ('En échange',   30),
  ('Intéressé',    40),
  ('RDV calé',     50),
  ('Client signé', 60),
  ('Perdu',        70)
) AS s(nom, ordre)
WHERE p.nom = 'Agent SAMA'
  AND NOT EXISTS (
    SELECT 1 FROM public.etapes_pipeline e
    WHERE e.pipeline_id = p.id AND e.nom = s.nom
  );

-- 4. RLS — opportunites: narrow staff->admin, add freelance own-or-pool ------
DROP POLICY IF EXISTS "staff only" ON public.opportunites;

CREATE POLICY "admin all opportunites" ON public.opportunites
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "freelance read own or pool opportunites" ON public.opportunites
  FOR SELECT USING (
    public.is_freelance() AND (owner_id = (SELECT auth.uid()) OR owner_id IS NULL)
  );

CREATE POLICY "freelance insert own opportunites" ON public.opportunites
  FOR INSERT WITH CHECK (
    public.is_freelance() AND owner_id = (SELECT auth.uid())
  );

-- USING allows touching own rows or claiming a NULL-pool row; WITH CHECK forces
-- the resulting row to be owned by the caller (cannot reassign to someone else).
CREATE POLICY "freelance update own or claim opportunites" ON public.opportunites
  FOR UPDATE USING (
    public.is_freelance() AND (owner_id = (SELECT auth.uid()) OR owner_id IS NULL)
  ) WITH CHECK (
    public.is_freelance() AND owner_id = (SELECT auth.uid())
  );

-- 5. RLS — entreprises: same pattern ----------------------------------------
DROP POLICY IF EXISTS "staff only" ON public.entreprises;

CREATE POLICY "admin all entreprises" ON public.entreprises
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "freelance read own or pool entreprises" ON public.entreprises
  FOR SELECT USING (
    public.is_freelance() AND (owner_id = (SELECT auth.uid()) OR owner_id IS NULL)
  );

CREATE POLICY "freelance insert own entreprises" ON public.entreprises
  FOR INSERT WITH CHECK (
    public.is_freelance() AND owner_id = (SELECT auth.uid())
  );

CREATE POLICY "freelance update own or claim entreprises" ON public.entreprises
  FOR UPDATE USING (
    public.is_freelance() AND (owner_id = (SELECT auth.uid()) OR owner_id IS NULL)
  ) WITH CHECK (
    public.is_freelance() AND owner_id = (SELECT auth.uid())
  );

-- Note (deferred to a follow-up pass): contacts / activity_log / pipeline_events
-- / kpi_targets keep their existing "staff only" policy; the agent portal scopes
-- them at the API/query layer for now. A dedicated commissions table is deferred.
