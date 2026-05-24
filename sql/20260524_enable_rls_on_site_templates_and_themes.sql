-- Both tables were previously RLS-disabled in the public schema, exposing
-- them to anon clients. All app access now goes through API routes using
-- service-role (which bypasses RLS), so enabling RLS here protects against
-- direct supabase-js calls from the browser without breaking the app.
-- Add a permissive authenticated SELECT policy as a safety net for any
-- future direct browser reads.

ALTER TABLE public.site_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read site_templates"
  ON public.site_templates FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY "Authenticated read site_themes"
  ON public.site_themes FOR SELECT
  TO authenticated
  USING ((select auth.uid()) IS NOT NULL);
