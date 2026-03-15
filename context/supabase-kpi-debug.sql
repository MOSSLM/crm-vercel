-- Debug + backfill pour "Activité commerciale réelle"
-- Cause probable: l'ancien SQL utilisait public.journal_succes, table supprimée par la refonte.
-- Source actuelle: public.activity_log + public.pipeline_events -> public.kpi_daily_facts.

-- 0) Vérifier les tables présentes
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('journal_succes', 'activity_log', 'pipeline_events', 'kpi_daily_facts', 'v_kpi_daily')
order by table_name;

-- 1) Créer kpi_daily_facts si nécessaire
create table if not exists public.kpi_daily_facts (
  id bigserial primary key,
  fact_date date not null,
  owner_id uuid null,
  leads_trouves numeric not null default 0,
  leads_qualifies numeric not null default 0,
  appels numeric not null default 0,
  rdv numeric not null default 0,
  devis numeric not null default 0,
  relances numeric not null default 0,
  signatures numeric not null default 0,
  acomptes numeric not null default 0,
  ca numeric not null default 0,
  mrr numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kpi_daily_facts_unique unique (fact_date, owner_id)
);

create index if not exists kpi_daily_facts_owner_date_idx
  on public.kpi_daily_facts (owner_id, fact_date desc);

create or replace view public.v_kpi_daily as
select
  fact_date,
  owner_id,
  leads_trouves,
  leads_qualifies,
  appels,
  rdv,
  devis,
  relances,
  signatures,
  acomptes,
  ca,
  mrr
from public.kpi_daily_facts;

-- 2) Backfill depuis activity_log (appels/rdv/devis/relances/signatures/acomptes)
insert into public.kpi_daily_facts (
  fact_date,
  owner_id,
  appels,
  rdv,
  devis,
  relances,
  signatures,
  acomptes,
  updated_at
)
select
  date_trunc('day', occurred_at)::date as fact_date,
  owner_id,
  count(*) filter (where activity_type = 'appel' and status = 'faite')::numeric as appels,
  count(*) filter (where activity_type = 'rdv' and status = 'faite')::numeric as rdv,
  count(*) filter (where activity_type = 'devis' and status = 'faite')::numeric as devis,
  count(*) filter (where activity_type = 'relance' and status = 'faite')::numeric as relances,
  count(*) filter (where activity_type = 'signature' and status = 'faite')::numeric as signatures,
  count(*) filter (where activity_type = 'encaissement' and status = 'faite')::numeric as acomptes,
  now()
from public.activity_log
group by 1, 2
on conflict (fact_date, owner_id)
do update set
  appels = excluded.appels,
  rdv = excluded.rdv,
  devis = excluded.devis,
  relances = excluded.relances,
  signatures = excluded.signatures,
  acomptes = excluded.acomptes,
  updated_at = now();

-- 3) Enrichir depuis pipeline_events (leads trouvés/qualifiés + CA signé)
insert into public.kpi_daily_facts (
  fact_date,
  owner_id,
  leads_trouves,
  leads_qualifies,
  signatures,
  ca,
  updated_at
)
select
  date_trunc('day', event_at)::date as fact_date,
  owner_id,
  count(*) filter (where stage = 'lead_trouve')::numeric as leads_trouves,
  count(*) filter (where stage = 'lead_qualifie')::numeric as leads_qualifies,
  count(*) filter (where stage = 'signe')::numeric as signatures,
  coalesce(sum(case when stage = 'signe' then amount else 0 end), 0)::numeric as ca,
  now()
from public.pipeline_events
group by 1, 2
on conflict (fact_date, owner_id)
do update set
  leads_trouves = excluded.leads_trouves,
  leads_qualifies = excluded.leads_qualifies,
  -- garde la valeur max de signatures pour éviter d'écraser par une source incomplète
  signatures = greatest(public.kpi_daily_facts.signatures, excluded.signatures),
  ca = excluded.ca,
  updated_at = now();

-- 4) Contrôles rapides
select count(*) as rows_in_kpi_daily_facts from public.kpi_daily_facts;

select
  fact_date,
  owner_id,
  appels,
  relances,
  rdv,
  devis,
  signatures,
  acomptes,
  leads_qualifies,
  ca
from public.kpi_daily_facts
order by fact_date desc
limit 30;
