-- CRM: gestion projets > tâches > sous-tâches
-- Compatible Supabase / PostgreSQL

begin;

-- 1) Enums

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'project_scope_enum' and n.nspname = 'public'
  ) then
    create type public.project_scope_enum as enum ('interne', 'entreprise');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'task_status_enum' and n.nspname = 'public'
  ) then
    create type public.task_status_enum as enum ('a_faire', 'en_cours', 'termine');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'task_priority_enum' and n.nspname = 'public'
  ) then
    create type public.task_priority_enum as enum ('haute', 'moyenne', 'basse');
  end if;
end$$;

-- 2) Fonction utilitaire updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3) Projets
create table if not exists public.crm_projects (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  scope public.project_scope_enum not null default 'interne',
  status public.task_status_enum not null default 'a_faire',
  priority public.task_priority_enum not null default 'moyenne',
  progress numeric(5,2) not null default 0,
  due_date date,

  -- Liens métier optionnels
  entreprise_id bigint,
  offre_id uuid references public.offres(id) on delete set null,

  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_projects_nom_not_empty check (length(trim(nom)) > 0),
  constraint crm_projects_progress_range check (progress >= 0 and progress <= 100)
);

-- FK entreprise conditionnelle (si la table existe déjà)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'entreprises'
  ) then
    alter table public.crm_projects
      drop constraint if exists crm_projects_entreprise_id_fkey;

    alter table public.crm_projects
      add constraint crm_projects_entreprise_id_fkey
      foreign key (entreprise_id)
      references public.entreprises(id)
      on delete set null;
  end if;
end$$;

create index if not exists crm_projects_scope_status_idx
  on public.crm_projects (scope, status, priority);
create index if not exists crm_projects_due_date_idx
  on public.crm_projects (due_date);
create index if not exists crm_projects_entreprise_idx
  on public.crm_projects (entreprise_id);
create index if not exists crm_projects_offre_idx
  on public.crm_projects (offre_id);

-- 4) Tâches
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.crm_projects(id) on delete cascade,
  titre text not null,
  description text,
  status public.task_status_enum not null default 'a_faire',
  priority public.task_priority_enum not null default 'moyenne',
  progress numeric(5,2) not null default 0,
  due_date date,
  position integer not null default 100,

  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_tasks_titre_not_empty check (length(trim(titre)) > 0),
  constraint crm_tasks_progress_range check (progress >= 0 and progress <= 100)
);

create index if not exists crm_tasks_project_idx
  on public.crm_tasks (project_id, position, created_at);
create index if not exists crm_tasks_due_date_idx
  on public.crm_tasks (due_date, status);
create index if not exists crm_tasks_status_priority_idx
  on public.crm_tasks (status, priority);

-- 5) Sous-tâches
create table if not exists public.crm_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.crm_tasks(id) on delete cascade,
  titre text not null,
  description text,
  status public.task_status_enum not null default 'a_faire',
  priority public.task_priority_enum not null default 'moyenne',
  progress numeric(5,2) not null default 0,
  due_date date,
  position integer not null default 100,

  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_subtasks_titre_not_empty check (length(trim(titre)) > 0),
  constraint crm_subtasks_progress_range check (progress >= 0 and progress <= 100)
);

create index if not exists crm_subtasks_task_idx
  on public.crm_subtasks (task_id, position, created_at);
create index if not exists crm_subtasks_due_date_idx
  on public.crm_subtasks (due_date, status);

-- 6) Triggers updated_at

drop trigger if exists trg_crm_projects_set_updated_at on public.crm_projects;
create trigger trg_crm_projects_set_updated_at
before update on public.crm_projects
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_tasks_set_updated_at on public.crm_tasks;
create trigger trg_crm_tasks_set_updated_at
before update on public.crm_tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_subtasks_set_updated_at on public.crm_subtasks;
create trigger trg_crm_subtasks_set_updated_at
before update on public.crm_subtasks
for each row execute function public.set_updated_at();

-- 7) Vues SQL prêtes à consommer dans le front

-- Vue: progression d'un projet, calculée automatiquement à partir des tâches/sous-tâches
create or replace view public.v_crm_project_progress as
with task_progress as (
  select
    t.id,
    t.project_id,
    case
      when count(st.id) > 0 then round(avg(st.progress), 2)
      else t.progress
    end as computed_task_progress
  from public.crm_tasks t
  left join public.crm_subtasks st on st.task_id = t.id
  group by t.id, t.project_id, t.progress
)
select
  p.id as project_id,
  p.nom,
  p.scope,
  p.status,
  p.priority,
  p.due_date,
  p.entreprise_id,
  p.offre_id,
  p.progress as manual_progress,
  coalesce(round(avg(tp.computed_task_progress), 2), p.progress) as computed_project_progress,
  count(distinct tp.id) as tasks_count,
  count(distinct st.id) as subtasks_count
from public.crm_projects p
left join task_progress tp on tp.project_id = p.id
left join public.crm_tasks t on t.project_id = p.id
left join public.crm_subtasks st on st.task_id = t.id
group by p.id;

-- Vue: agenda quotidien (navigable par date côté front)
create or replace view public.v_crm_daily_tasks as
select
  t.id,
  'task'::text as item_type,
  t.titre as item_title,
  t.description,
  t.status,
  t.priority,
  t.progress,
  t.due_date,
  p.id as project_id,
  p.nom as project_name,
  p.scope as project_scope,
  p.entreprise_id,
  p.offre_id,
  null::uuid as parent_task_id,
  null::text as parent_task_title
from public.crm_tasks t
join public.crm_projects p on p.id = t.project_id
where t.due_date is not null

union all

select
  st.id,
  'subtask'::text as item_type,
  st.titre as item_title,
  st.description,
  st.status,
  st.priority,
  st.progress,
  st.due_date,
  p.id as project_id,
  p.nom as project_name,
  p.scope as project_scope,
  p.entreprise_id,
  p.offre_id,
  t.id as parent_task_id,
  t.titre as parent_task_title
from public.crm_subtasks st
join public.crm_tasks t on t.id = st.task_id
join public.crm_projects p on p.id = t.project_id
where st.due_date is not null;

commit;
