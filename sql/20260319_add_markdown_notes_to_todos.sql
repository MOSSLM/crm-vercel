-- Ajout de notes longues Markdown pour projet / tâche / sous-tâche CRM

alter table if exists public.crm_projects
  add column if not exists note_markdown text;

alter table if exists public.crm_tasks
  add column if not exists note_markdown text;

alter table if exists public.crm_subtasks
  add column if not exists note_markdown text;

comment on column public.crm_projects.note_markdown is 'Note longue en markdown du projet';
comment on column public.crm_tasks.note_markdown is 'Note longue en markdown de la tâche';
comment on column public.crm_subtasks.note_markdown is 'Note longue en markdown de la sous-tâche';
