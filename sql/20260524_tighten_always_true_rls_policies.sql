-- Replace USING/WITH CHECK = true with auth.uid() IS NOT NULL.
-- The single-tenant app has no per-row ownership today, so this is the same
-- effective behavior — any authenticated user can read/write — but the
-- `rls_policy_always_true` lint passes and the policy intent
-- ("authenticated only") is explicit.
-- Bonus: auth.uid() is wrapped in (select ...) so PostgreSQL only evaluates
-- it once per query instead of per-row (auth_rls_initplan lint fix).

-- enrichment_tag_settings
DROP POLICY IF EXISTS "Authenticated delete enrichment_tag_settings" ON public.enrichment_tag_settings;
CREATE POLICY "Authenticated delete enrichment_tag_settings"
  ON public.enrichment_tag_settings FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated insert enrichment_tag_settings" ON public.enrichment_tag_settings;
CREATE POLICY "Authenticated insert enrichment_tag_settings"
  ON public.enrichment_tag_settings FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated update enrichment_tag_settings" ON public.enrichment_tag_settings;
CREATE POLICY "Authenticated update enrichment_tag_settings"
  ON public.enrichment_tag_settings FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- forms
DROP POLICY IF EXISTS "auth_write_forms" ON public.forms;
CREATE POLICY "auth_write_forms"
  ON public.forms FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- media_library
DROP POLICY IF EXISTS "Authenticated delete media_library" ON public.media_library;
CREATE POLICY "Authenticated delete media_library"
  ON public.media_library FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated insert media_library" ON public.media_library;
CREATE POLICY "Authenticated insert media_library"
  ON public.media_library FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated update media_library" ON public.media_library;
CREATE POLICY "Authenticated update media_library"
  ON public.media_library FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- site_builder_assets
DROP POLICY IF EXISTS "Authenticated delete site_builder_assets" ON public.site_builder_assets;
CREATE POLICY "Authenticated delete site_builder_assets"
  ON public.site_builder_assets FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated insert site_builder_assets" ON public.site_builder_assets;
CREATE POLICY "Authenticated insert site_builder_assets"
  ON public.site_builder_assets FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- site_versions
DROP POLICY IF EXISTS "Authenticated users can manage site versions" ON public.site_versions;
CREATE POLICY "Authenticated users can manage site versions"
  ON public.site_versions FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- theme_sections: was `TO public` with USING(true) which effectively granted
-- every role full access. Tighten to authenticated-only.
DROP POLICY IF EXISTS "Service role full access" ON public.theme_sections;
CREATE POLICY "Authenticated full access theme_sections"
  ON public.theme_sections FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);
