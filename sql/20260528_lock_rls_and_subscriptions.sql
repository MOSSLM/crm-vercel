-- Lock down RLS on all CRM tables, link client to entreprise, add Stripe
-- placeholders, and create the client_subscriptions table.

-- ─── Backfill profiles manquants ────────────────────────────────────────
INSERT INTO public.user_profiles (id, email, role, actif)
SELECT u.id, u.email, 'client', true
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ─── Trigger idempotent ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Liens client ↔ entreprise / Stripe customer ────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS entreprise_id bigint REFERENCES public.entreprises(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE INDEX IF NOT EXISTS user_profiles_entreprise_idx ON public.user_profiles(entreprise_id);
CREATE INDEX IF NOT EXISTS user_profiles_stripe_customer_idx
  ON public.user_profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ─── Stripe price sur offres ────────────────────────────────────────────
ALTER TABLE public.offres ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- ─── Table client_subscriptions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  offre_id uuid NOT NULL REFERENCES public.offres(id) ON DELETE RESTRICT,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','past_due','canceled','incomplete','trialing','paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_client_idx ON public.client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS cs_stripe_sub_idx ON public.client_subscriptions(stripe_subscription_id);

ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client reads own subscriptions" ON public.client_subscriptions;
DROP POLICY IF EXISTS "staff full subscriptions" ON public.client_subscriptions;
CREATE POLICY "client reads own subscriptions" ON public.client_subscriptions
  FOR SELECT USING (client_id = (SELECT auth.uid()));
CREATE POLICY "staff full subscriptions" ON public.client_subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role IN ('admin','freelance'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles up
            WHERE up.id = (SELECT auth.uid()) AND up.role IN ('admin','freelance'))
  );

-- ─── Lockdown RLS sur toutes les tables CRM ─────────────────────────────
-- Drop the permissive "Allow all for authenticated" / "au_all_authenticated"
-- variants and replace with a strict staff-only policy.
DO $$
DECLARE
  t record;
  staff_check text := 'EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = (SELECT auth.uid()) AND up.role IN (''admin'',''freelance''))';
BEGIN
  FOR t IN
    SELECT DISTINCT c.relname AS tbl
    FROM pg_class c
    JOIN pg_policy p ON p.polrelid = c.oid
    WHERE c.relkind='r' AND c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
      AND p.polname IN ('Allow all for authenticated','au_all_authenticated',
                        'auth_read_submissions','auth_write_forms',
                        'auth users can manage email_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all for authenticated', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'au_all_authenticated', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_read_submissions', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth_write_forms', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'auth users can manage email_logs', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff only', t.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (%s) WITH CHECK (%s)',
      'staff only', t.tbl, staff_check, staff_check
    );
  END LOOP;
END $$;

-- ─── Exception : sites — client peut lire son propre site ───────────────
DROP POLICY IF EXISTS "client reads own site" ON public.sites;
CREATE POLICY "client reads own site" ON public.sites
  FOR SELECT USING (
    enterprise_id IS NOT NULL
    AND enterprise_id = (SELECT entreprise_id FROM public.user_profiles WHERE id = (SELECT auth.uid()))
  );
