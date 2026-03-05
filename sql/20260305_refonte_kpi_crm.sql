-- Refonte KPI CRM: objectifs, actions quotidiennes et conversions funnel

begin;

-- 1) Supprimer l'ancien modèle (si présent)
drop table if exists public.kpi_objectives cascade;
drop table if exists public.journal_succes cascade;

-- 2) Enums métier

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'kpi_scope_enum' and n.nspname = 'public') then
    create type public.kpi_scope_enum as enum ('global', 'equipe', 'commercial');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'kpi_activity_type_enum' and n.nspname = 'public') then
    create type public.kpi_activity_type_enum as enum ('appel', 'email', 'sms', 'rdv', 'relance', 'devis', 'signature', 'encaissement', 'note');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'kpi_activity_status_enum' and n.nspname = 'public') then
    create type public.kpi_activity_status_enum as enum ('a_faire', 'faite', 'annulee');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where t.typname = 'pipeline_stage_enum' and n.nspname = 'public') then
    create type public.pipeline_stage_enum as enum ('lead_trouve', 'lead_qualifie', 'appel', 'rdv', 'devis', 'negociation', 'signe', 'acompte');
  end if;
end$$;

-- 3) Objectifs
create table if not exists public.kpi_targets (
  id uuid primary key default gen_random_uuid(),
  scope public.kpi_scope_enum not null default 'global',
  owner_id uuid null,
  period_unit public.period_unit_enum not null,
  period_start date not null,
  period_end date not null,
  label text null,
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
  constraint kpi_targets_period_order_chk check (period_end >= period_start),
  constraint kpi_targets_unique unique (scope, owner_id, period_unit, period_start)
);

create index if not exists kpi_targets_period_idx
  on public.kpi_targets (period_unit, period_start, period_end);

create index if not exists kpi_targets_owner_idx
  on public.kpi_targets (owner_id, period_start desc);

-- 4) Journal d'actions (granulaire)
create table if not exists public.activity_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  owner_id uuid null,
  activity_type public.kpi_activity_type_enum not null,
  status public.kpi_activity_status_enum not null default 'faite',
  title text null,
  description text null,
  opportunite_id uuid null,
  entreprise_id bigint null,
  lead_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_occurred_at_idx
  on public.activity_log (occurred_at desc);

create index if not exists activity_log_owner_idx
  on public.activity_log (owner_id, occurred_at desc);

create index if not exists activity_log_opportunite_idx
  on public.activity_log (opportunite_id, occurred_at desc);

-- 5) Événements pipeline (source de vérité conversions)
create table if not exists public.pipeline_events (
  id bigserial primary key,
  event_at timestamptz not null default now(),
  owner_id uuid null,
  opportunite_id uuid null,
  entreprise_id bigint null,
  lead_id uuid null,
  stage public.pipeline_stage_enum not null,
  amount numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_events_stage_date_idx
  on public.pipeline_events (stage, event_at desc);

create index if not exists pipeline_events_owner_date_idx
  on public.pipeline_events (owner_id, event_at desc);

create index if not exists pipeline_events_opportunite_idx
  on public.pipeline_events (opportunite_id, event_at desc);

-- 6) Agrégat quotidien (cache KPI)
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

-- 7) Vues reporting
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

create or replace view public.v_conversion_funnel as
with base as (
  select
    date_trunc('day', event_at)::date as period_date,
    owner_id,
    count(*) filter (where stage = 'lead_trouve') as lead_trouve,
    count(*) filter (where stage = 'lead_qualifie') as lead_qualifie,
    count(*) filter (where stage = 'appel') as appel,
    count(*) filter (where stage = 'rdv') as rdv,
    count(*) filter (where stage = 'devis') as devis,
    count(*) filter (where stage = 'signe') as signe
  from public.pipeline_events
  group by 1, 2
)
select
  period_date,
  owner_id,
  lead_trouve,
  lead_qualifie,
  appel,
  rdv,
  devis,
  signe,
  case when lead_trouve > 0 then round((lead_qualifie::numeric / lead_trouve::numeric) * 100, 2) else 0 end as tx_qualification_pct,
  case when appel > 0 then round((rdv::numeric / appel::numeric) * 100, 2) else 0 end as tx_rdv_sur_appels_pct,
  case when rdv > 0 then round((devis::numeric / rdv::numeric) * 100, 2) else 0 end as tx_devis_sur_rdv_pct,
  case when devis > 0 then round((signe::numeric / devis::numeric) * 100, 2) else 0 end as tx_signature_sur_devis_pct,
  case when lead_trouve > 0 then round((signe::numeric / lead_trouve::numeric) * 100, 2) else 0 end as tx_closing_global_pct
from base;

create or replace view public.v_target_vs_actual as
with actual as (
  select
    owner_id,
    date_trunc('month', fact_date)::date as period_start,
    sum(leads_trouves) as leads_trouves,
    sum(leads_qualifies) as leads_qualifies,
    sum(appels) as appels,
    sum(rdv) as rdv,
    sum(devis) as devis,
    sum(relances) as relances,
    sum(signatures) as signatures,
    sum(acomptes) as acomptes,
    sum(ca) as ca,
    sum(mrr) as mrr
  from public.kpi_daily_facts
  group by 1, 2
)
select
  t.id as target_id,
  t.scope,
  t.owner_id,
  t.period_unit,
  t.period_start,
  t.period_end,
  t.label,
  t.leads_trouves as target_leads_trouves,
  coalesce(a.leads_trouves, 0) as actual_leads_trouves,
  case when t.leads_trouves > 0 then round((coalesce(a.leads_trouves, 0) / t.leads_trouves) * 100, 2) else 0 end as attainment_leads_trouves_pct,
  t.appels as target_appels,
  coalesce(a.appels, 0) as actual_appels,
  case when t.appels > 0 then round((coalesce(a.appels, 0) / t.appels) * 100, 2) else 0 end as attainment_appels_pct,
  t.rdv as target_rdv,
  coalesce(a.rdv, 0) as actual_rdv,
  case when t.rdv > 0 then round((coalesce(a.rdv, 0) / t.rdv) * 100, 2) else 0 end as attainment_rdv_pct,
  t.devis as target_devis,
  coalesce(a.devis, 0) as actual_devis,
  case when t.devis > 0 then round((coalesce(a.devis, 0) / t.devis) * 100, 2) else 0 end as attainment_devis_pct,
  t.signatures as target_signatures,
  coalesce(a.signatures, 0) as actual_signatures,
  case when t.signatures > 0 then round((coalesce(a.signatures, 0) / t.signatures) * 100, 2) else 0 end as attainment_signatures_pct,
  t.ca as target_ca,
  coalesce(a.ca, 0) as actual_ca,
  case when t.ca > 0 then round((coalesce(a.ca, 0) / t.ca) * 100, 2) else 0 end as attainment_ca_pct
from public.kpi_targets t
left join actual a
  on a.period_start = date_trunc('month', t.period_start)::date
 and a.owner_id is not distinct from t.owner_id;

commit;
