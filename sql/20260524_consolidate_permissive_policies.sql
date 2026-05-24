-- 6 multiple_permissive_policies advisor warnings boil down to two issues:
--   1. forms.auth_read_forms is USING(true) and redundant with auth_write_forms
--      (which is FOR ALL). Drop the read-only policy.
--   2. sites."Allow all for authenticated" was TO public; for SELECT it
--      overlapped sites_public_read. Restrict it to authenticated and
--      restrict sites_public_read to anon, so each role gets exactly one
--      SELECT policy.

DROP POLICY IF EXISTS "auth_read_forms" ON public.forms;

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.sites;
CREATE POLICY "Allow all for authenticated"
  ON public.sites FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "sites_public_read" ON public.sites;
CREATE POLICY "sites_public_read"
  ON public.sites FOR SELECT TO anon
  USING (is_published = true);
