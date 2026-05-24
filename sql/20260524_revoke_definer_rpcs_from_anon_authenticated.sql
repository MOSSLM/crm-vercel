-- Internal helpers + trigger functions that shouldn't be callable via
-- PostgREST. Functions in the public schema grant EXECUTE to PUBLIC by
-- default, and anon/authenticated inherit that — so we have to revoke from
-- PUBLIC as well as the inherited roles.
REVOKE EXECUTE ON FUNCTION public.assign_to_reseau(uuid, bigint[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_reseau_and_assign(text, bigint[], text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_leadmagnet_favicon() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enrich_lead_magnet_on_ready() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lead_magnets_fill_reviews_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.propagate_company_reviews_to_lead_magnets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_automation_event() FROM PUBLIC, anon, authenticated;

-- list_company_contacts IS called from the browser (src/utils/api.tsx:955),
-- so keep authenticated grant. Revoke from PUBLIC + anon.
REVOKE EXECUTE ON FUNCTION public.list_company_contacts(bigint, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_company_contacts(bigint, timestamptz, integer) TO authenticated;
