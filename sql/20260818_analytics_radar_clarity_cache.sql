-- =====================================================================
-- Radar analytics — cache des métriques Clarity (Data Export API)
-- =====================================================================
-- POURQUOI UN CACHE : l'API Data Export de Clarity plafonne à 10 requêtes
-- par jour et par projet, et ne couvre que les 1 à 3 derniers jours. La page
-- /site-builder/radar-analytics ne doit donc JAMAIS appeler Clarity en direct
-- depuis une requête utilisateur (un onglet ouvert deux fois épuiserait le
-- quota) : un cron rapatrie les métriques toutes les 4h (6 appels/jour, sous
-- le plafond) et les stocke ici ; la route API lit cette table.
--
-- Une seule ligne vivante par métrique+dimension — `upsert` sur (metric,
-- dimension1, dimension2, dimension3) écrase la précédente collecte.
--
-- ⚠️ REMPLACER `<PG_CRON_SECRET>` AVANT D'EXÉCUTER (jamais en clair dans git,
-- voir sql/20260810_audit_site_cron.sql).
-- =====================================================================

begin;

create table if not exists public.analytics_radar_clarity_cache (
  id           bigint generated always as identity primary key,
  metric_name  text not null,
  dimension1   text,
  dimension2   text,
  dimension3   text,
  payload      jsonb not null,
  fetched_at   timestamptz not null default now(),
  unique (metric_name, dimension1, dimension2, dimension3)
);

alter table public.analytics_radar_clarity_cache enable row level security;

-- Ces lignes couvrent TOUS les prospects. Une policy `using (true)` sur
-- `authenticated` les rendait lisibles par n'importe quel compte connecté,
-- rôle `client` compris — ce qui contournait le garde-fou requireStaff posé
-- sur /api/analytics-radar. On restreint au personnel interne ; la route API
-- lit de toute façon via la service key, donc elle n'est pas affectée.
drop policy if exists analytics_radar_clarity_cache_authenticated on public.analytics_radar_clarity_cache;
drop policy if exists analytics_radar_clarity_cache_staff on public.analytics_radar_clarity_cache;
create policy analytics_radar_clarity_cache_staff
  on public.analytics_radar_clarity_cache
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and p.role in ('admin', 'freelance')
    )
  );

commit;

-- ── pg_cron : rapatriement 3×/jour ────────────────────────────────────────
-- Le quota Clarity Data Export est de 10 appels/jour/projet, et la route
-- consomme 3 appels par passage (une dimension chacun). Toutes les 4h faisait
-- 6 passages = 18 appels/jour, soit près du double du plafond : les derniers
-- passages échouaient et le cache restait partiel. 3 passages = 9 appels,
-- juste sous la limite, avec un appel de marge pour un déclenchement manuel.
-- La fenêtre Clarity étant de 1 à 3 jours, rafraîchir plus souvent n'apporte
-- de toute façon rien.
select cron.unschedule('analytics-radar-clarity-sync')
where exists (select 1 from cron.job where jobname = 'analytics-radar-clarity-sync');

select cron.schedule(
  'analytics-radar-clarity-sync',
  '11 2,10,18 * * *',
  $job$
  select net.http_post(
    url        := 'https://www.samadigitalstudio.fr/api/cron/analytics-radar-clarity-sync',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $job$
);

-- Vérification :
--   select jobname, schedule, active from cron.job where jobname = 'analytics-radar-clarity-sync';
--   select * from public.analytics_radar_clarity_cache order by fetched_at desc limit 20;
