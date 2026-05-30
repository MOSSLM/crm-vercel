-- Fix infinite-recursion errors caused by RLS policies on user_profiles that
-- queried user_profiles themselves. Wrap role/entreprise lookups in
-- SECURITY DEFINER helpers (which bypass RLS) and reference them from policies.

-- ─── Helpers SECURITY DEFINER ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role IN ('admin','freelance')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_entreprise_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT entreprise_id FROM public.user_profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.my_entreprise_id() TO anon, authenticated;

-- ─── user_profiles : recréer les policies sans récursion ────────────────
DROP POLICY IF EXISTS "users select own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "users update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "staff read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins write all profiles" ON public.user_profiles;

CREATE POLICY "users select own profile" ON public.user_profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);
CREATE POLICY "users update own profile" ON public.user_profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id)
              WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "staff read all profiles" ON public.user_profiles
  FOR SELECT USING (public.is_staff());
CREATE POLICY "admins write all profiles" ON public.user_profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── offres ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "read active offres or staff" ON public.offres;
DROP POLICY IF EXISTS "staff write offres" ON public.offres;
CREATE POLICY "read active offres or staff" ON public.offres
  FOR SELECT USING (actif = true OR public.is_staff());
CREATE POLICY "staff write offres" ON public.offres
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ─── client_subscriptions ──────────────────────────────────────────────
DROP POLICY IF EXISTS "client reads own subscriptions" ON public.client_subscriptions;
DROP POLICY IF EXISTS "staff full subscriptions" ON public.client_subscriptions;
CREATE POLICY "client reads own subscriptions" ON public.client_subscriptions
  FOR SELECT USING (client_id = (SELECT auth.uid()));
CREATE POLICY "staff full subscriptions" ON public.client_subscriptions
  FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ─── sites : client lit son propre site (sans sous-requête user_profiles)
DROP POLICY IF EXISTS "client reads own site" ON public.sites;
CREATE POLICY "client reads own site" ON public.sites
  FOR SELECT USING (
    enterprise_id IS NOT NULL AND enterprise_id = public.my_entreprise_id()
  );

-- ─── Réécriture en bloc des "staff only" sur toutes les autres tables CRM
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT DISTINCT c.relname AS tbl
    FROM pg_class c
    JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relkind='r'
      AND c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      AND p.polname = 'staff only'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff only', t.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_staff()) WITH CHECK (public.is_staff())',
      'staff only', t.tbl
    );
  END LOOP;
END $$;
