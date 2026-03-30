-- Multi-pipeline support for CRM
-- 1) New pipelines table
create table if not exists public.pipelines (
  id uuid not null default gen_random_uuid(),
  nom text not null,
  ordre integer not null,
  visible boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pipelines_pkey primary key (id),
  constraint pipelines_nom_uk unique (lower(nom)),
  constraint pipelines_ordre_uk unique (ordre)
);

-- Ensure a default pipeline exists
insert into public.pipelines (nom, ordre, visible, is_default)
select 'Général', 1, true, true
where not exists (
  select 1 from public.pipelines where is_default = true
);

-- Keep exactly one default pipeline
with ranked_defaults as (
  select id, row_number() over (order by ordre asc, created_at asc) as rn
  from public.pipelines
  where is_default = true
)
update public.pipelines p
set is_default = (ranked_defaults.rn = 1)
from ranked_defaults
where ranked_defaults.id = p.id;

-- 2) Add pipeline_id to stages
alter table public.etapes_pipeline
  add column if not exists pipeline_id uuid;

update public.etapes_pipeline ep
set pipeline_id = default_pipeline.id
from (
  select id from public.pipelines where is_default = true order by ordre asc limit 1
) as default_pipeline
where ep.pipeline_id is null;

alter table public.etapes_pipeline
  alter column pipeline_id set not null;

alter table public.etapes_pipeline
  drop constraint if exists etapes_pipeline_pipeline_id_fkey;

alter table public.etapes_pipeline
  add constraint etapes_pipeline_pipeline_id_fkey
  foreign key (pipeline_id) references public.pipelines(id) on delete cascade;

-- Replace old global uniques by per-pipeline uniques
drop index if exists public.etapes_pipeline_ordre_uk;
drop index if exists public.etapes_pipeline_nom_uk;

create unique index if not exists etapes_pipeline_pipeline_ordre_uk
  on public.etapes_pipeline using btree (pipeline_id, ordre);

create unique index if not exists etapes_pipeline_pipeline_nom_uk
  on public.etapes_pipeline using btree (pipeline_id, lower(nom));

-- 3) Add pipeline_id to opportunities
alter table public.opportunites
  add column if not exists pipeline_id uuid;

-- Derive pipeline_id from current stage if possible
update public.opportunites o
set pipeline_id = ep.pipeline_id
from public.etapes_pipeline ep
where o.stage_id = ep.id
  and o.pipeline_id is null;

-- Fallback to default pipeline
update public.opportunites o
set pipeline_id = default_pipeline.id
from (
  select id from public.pipelines where is_default = true order by ordre asc limit 1
) as default_pipeline
where o.pipeline_id is null;

alter table public.opportunites
  alter column pipeline_id set not null;

alter table public.opportunites
  drop constraint if exists opportunites_pipeline_id_fkey;

alter table public.opportunites
  add constraint opportunites_pipeline_id_fkey
  foreign key (pipeline_id) references public.pipelines(id) on delete restrict;

create index if not exists opportunites_pipeline_id_idx
  on public.opportunites using btree (pipeline_id);

-- 4) Keep stage and pipeline consistent automatically
create or replace function public.sync_opportunity_pipeline_from_stage()
returns trigger
language plpgsql
as $$
declare
  stage_pipeline_id uuid;
begin
  if new.stage_id is not null then
    select pipeline_id into stage_pipeline_id
    from public.etapes_pipeline
    where id = new.stage_id;

    if stage_pipeline_id is null then
      raise exception 'Étape pipeline introuvable: %', new.stage_id;
    end if;

    new.pipeline_id := stage_pipeline_id;
  elsif new.pipeline_id is null then
    select id into new.pipeline_id
    from public.pipelines
    where is_default = true
    order by ordre asc
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_opportunity_pipeline_from_stage on public.opportunites;
create trigger trg_sync_opportunity_pipeline_from_stage
before insert or update of stage_id, pipeline_id
on public.opportunites
for each row
execute function public.sync_opportunity_pipeline_from_stage();
