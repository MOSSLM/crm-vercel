-- Switch the 10 views flagged as `security_definer_view` by the Supabase
-- advisor to SECURITY INVOKER. The default behavior in Postgres is to run
-- a view's SQL as the view OWNER, which bypasses RLS on the underlying
-- tables. With invoker rights the view's SQL runs with the caller's
-- privileges, so RLS actually applies.
--
-- All server-side code uses service-role (bypasses RLS), so the only
-- callers this affects are direct supabase-js reads from the browser.
-- Those rely on the authenticated role's table grants, which Supabase
-- sets up by default.
ALTER VIEW public.vw_lead_magnet_plugin_kv SET (security_invoker = on);
ALTER VIEW public.vw_lead_magnet_plugin_ready SET (security_invoker = on);
ALTER VIEW public.v_target_vs_actual SET (security_invoker = on);
ALTER VIEW public.enrichment_distinct_service_tags SET (security_invoker = on);
ALTER VIEW public.v_offres_qualification SET (security_invoker = on);
ALTER VIEW public.v_crm_daily_tasks SET (security_invoker = on);
ALTER VIEW public.v_kpi_daily SET (security_invoker = on);
ALTER VIEW public.v_crm_project_progress SET (security_invoker = on);
ALTER VIEW public.v_freelance_soldes SET (security_invoker = on);
ALTER VIEW public.v_conversion_funnel SET (security_invoker = on);
