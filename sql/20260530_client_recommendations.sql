-- Recommended services per client + tighten client-side offres visibility.

CREATE TABLE IF NOT EXISTS public.client_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  offre_id uuid NOT NULL REFERENCES public.offres(id) ON DELETE CASCADE,
  note text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, offre_id)
);
CREATE INDEX IF NOT EXISTS cr_client_idx ON public.client_recommendations(client_id);
CREATE INDEX IF NOT EXISTS cr_offre_idx ON public.client_recommendations(offre_id);

ALTER TABLE public.client_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client reads own recommendations" ON public.client_recommendations;
DROP POLICY IF EXISTS "staff full recommendations" ON public.client_recommendations;
CREATE POLICY "client reads own recommendations" ON public.client_recommendations
  FOR SELECT USING (client_id = (SELECT auth.uid()));
CREATE POLICY "staff full recommendations" ON public.client_recommendations
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- A client only sees offers that are *visible_in_qualification* (the column
-- name is misleading — `actif` means "active anywhere in the CRM"; the
-- "shown in qualification" flag is the real customer-facing filter).
DROP POLICY IF EXISTS "read active offres or staff" ON public.offres;
CREATE POLICY "read visible offres or staff" ON public.offres
  FOR SELECT USING (
    (actif = true AND visible_in_qualification = true)
    OR public.is_staff()
  );
