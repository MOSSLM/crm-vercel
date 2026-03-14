begin;

alter table if exists public.crm_tasks
  alter column project_id drop not null;

alter table if exists public.crm_projects
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists background_color text not null default '#eef2ff';

alter table if exists public.crm_projects
  drop constraint if exists crm_projects_background_color_hex_check;

alter table if exists public.crm_projects
  add constraint crm_projects_background_color_hex_check
  check (background_color ~ '^#[0-9A-Fa-f]{6}$');

alter table if exists public.crm_tasks
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;

alter table if exists public.crm_subtasks
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz;

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
  t.start_at,
  t.end_at,
  p.id as project_id,
  p.nom as project_name,
  p.scope as project_scope,
  p.entreprise_id,
  p.offre_id,
  null::uuid as parent_task_id,
  null::text as parent_task_title
from public.crm_tasks t
left join public.crm_projects p on p.id = t.project_id
where t.due_date is not null or t.start_at is not null or t.end_at is not null

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
  st.start_at,
  st.end_at,
  p.id as project_id,
  p.nom as project_name,
  p.scope as project_scope,
  p.entreprise_id,
  p.offre_id,
  t.id as parent_task_id,
  t.titre as parent_task_title
from public.crm_subtasks st
join public.crm_tasks t on t.id = st.task_id
left join public.crm_projects p on p.id = t.project_id
where st.due_date is not null or st.start_at is not null or st.end_at is not null;

commit;
