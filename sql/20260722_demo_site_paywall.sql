-- Per-demo-site paywall flag. Demo sites do NOT show the purchase paywall bar by
-- default; an admin (kanban multi-select) or the owning agent flips this per site.
-- `booking_url` powers the "Réserver un appel" CTA on the paywall bar (falls back
-- to the SAMA contact when null).

begin;

alter table public.sites
  add column if not exists paywall_enabled boolean not null default false,
  add column if not exists booking_url text,
  -- Free-text brief the buyer fills post-purchase so we can re-adapt their site.
  add column if not exists client_brief text;

commit;
