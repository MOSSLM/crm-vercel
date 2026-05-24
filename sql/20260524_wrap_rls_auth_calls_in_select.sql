-- 60 RLS policies re-evaluate auth.uid()/auth.role() once per row instead
-- of once per query. Wrap them in (select ...) so PostgreSQL can hoist the
-- expression. Same logical behavior, dramatically better at scale.
--
-- Two families to rewrite:
--   1. 55 generic "Allow all for authenticated" / "au_all_authenticated"
--      policies that use auth.role() = 'authenticated'.
--   2. 5 email_*_templates / email_signature_settings policies that use
--      auth.uid() = user_id.

-- ---------------- Family 1: generic auth.role() policies ----------------
DO $$
DECLARE
  rec RECORD;
  has_with_check boolean;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename, policyname, cmd, qual::text AS qual_text,
           with_check::text AS check_text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN ('Allow all for authenticated', 'au_all_authenticated')
  LOOP
    has_with_check := rec.check_text IS NOT NULL;
    EXECUTE format('DROP POLICY %I ON %I.%I',
                   rec.policyname, rec.schemaname, rec.tablename);
    IF has_with_check THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO public USING ((select auth.role()) = ''authenticated'') WITH CHECK ((select auth.role()) = ''authenticated'')',
        rec.policyname, rec.schemaname, rec.tablename);
    ELSE
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO public USING ((select auth.role()) = ''authenticated'')',
        rec.policyname, rec.schemaname, rec.tablename);
    END IF;
  END LOOP;
END $$;

-- ---------------- Family 2: email_* policies on auth.uid() = user_id ----------------
DROP POLICY IF EXISTS "Users manage own signature settings" ON public.email_signature_settings;
CREATE POLICY "Users manage own signature settings"
  ON public.email_signature_settings FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Read templates" ON public.email_templates;
CREATE POLICY "Read templates"
  ON public.email_templates FOR SELECT TO authenticated
  USING ((is_default = true) OR ((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Insert own templates" ON public.email_templates;
CREATE POLICY "Insert own templates"
  ON public.email_templates FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id) AND (is_default = false));

DROP POLICY IF EXISTS "Update own templates" ON public.email_templates;
CREATE POLICY "Update own templates"
  ON public.email_templates FOR UPDATE TO authenticated
  USING (((select auth.uid()) = user_id) AND (is_default = false))
  WITH CHECK (((select auth.uid()) = user_id) AND (is_default = false));

DROP POLICY IF EXISTS "Delete own templates" ON public.email_templates;
CREATE POLICY "Delete own templates"
  ON public.email_templates FOR DELETE TO authenticated
  USING (((select auth.uid()) = user_id) AND (is_default = false));

DROP POLICY IF EXISTS "auth users can manage email_logs" ON public.email_logs;
CREATE POLICY "auth users can manage email_logs"
  ON public.email_logs FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);
