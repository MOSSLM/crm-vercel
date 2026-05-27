-- Client portal: add 'client' role, onboarding columns, trigger, and role-aware RLS.

-- Étendre le rôle pour autoriser 'client'
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin','freelance','client'));

-- Colonnes onboarding
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS prenom text,
  ADD COLUMN IF NOT EXISTS nom text,
  ADD COLUMN IF NOT EXISTS entreprise text,
  ADD COLUMN IF NOT EXISTS role_in_company text,
  ADD COLUMN IF NOT EXISTS team_size text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Trigger: auto-create a user_profiles row on signup (role='client' default)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, full_name, actif)
  VALUES (NEW.id, NEW.email, 'client', NEW.raw_user_meta_data->>'full_name', true)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS sur user_profiles : replace permissive policy with role-aware ones
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.user_profiles;
DROP POLICY IF EXISTS "users select own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "users update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "admins read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "staff read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins write all profiles" ON public.user_profiles;

CREATE POLICY "users select own profile" ON public.user_profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);
CREATE POLICY "users update own profile" ON public.user_profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "staff read all profiles" ON public.user_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role IN ('admin','freelance'))
  );
CREATE POLICY "admins write all profiles" ON public.user_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role = 'admin')
  );

-- RLS sur offres : clients voient uniquement actif=true ; staff a tout accès
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.offres;
DROP POLICY IF EXISTS "read active offres or staff" ON public.offres;
DROP POLICY IF EXISTS "staff write offres" ON public.offres;

CREATE POLICY "read active offres or staff" ON public.offres
  FOR SELECT USING (
    actif = true
    OR EXISTS (SELECT 1 FROM public.user_profiles up
               WHERE up.id = (SELECT auth.uid()) AND up.role IN ('admin','freelance'))
  );
CREATE POLICY "staff write offres" ON public.offres
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role IN ('admin','freelance'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role IN ('admin','freelance'))
  );
