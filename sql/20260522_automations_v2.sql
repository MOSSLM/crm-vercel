-- Espace Automatisations v2 — workflows, séquences, démarchage, connexions.
-- Appliqué via Supabase MCP (migration automations_v2_schema).

create or replace function public.tg_au_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ── automations (workflows + séquences unifiés) ──────────────────────────
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'workflow' check (kind in ('workflow','sequence')),
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('on','paused','draft','error')),
  owner_id uuid references public.user_profiles(id) on delete set null,
  trigger_type text,
  trigger_pipeline_id uuid references public.pipelines(id) on delete set null,
  trigger_stage_id smallint references public.etapes_pipeline(id) on delete set null,
  definition jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  runs_7d int not null default 0,
  success_7d numeric,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_kind_status_idx on public.automations(kind, status);
create index if not exists automations_trigger_idx on public.automations(trigger_type, trigger_pipeline_id, trigger_stage_id);
create trigger automations_updated before update on public.automations
  for each row execute function public.tg_au_updated_at();

-- ── automation_runs (journal d'exécution) ────────────────────────────────
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  status text not null default 'running' check (status in ('running','success','error','skipped')),
  trigger_type text,
  context jsonb not null default '{}'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  error text,
  is_test boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists automation_runs_automation_idx on public.automation_runs(automation_id, started_at desc);

-- ── sequence_enrollments ─────────────────────────────────────────────────
create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  opportunite_id uuid references public.opportunites(id) on delete set null,
  entreprise_id bigint references public.entreprises(id) on delete set null,
  current_step int not null default 0,
  status text not null default 'active' check (status in ('active','paused','finished','replied','exited')),
  next_run_at timestamptz,
  vars jsonb not null default '{}'::jsonb,
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sequence_enrollments_due_idx on public.sequence_enrollments(status, next_run_at);
create index if not exists sequence_enrollments_automation_idx on public.sequence_enrollments(automation_id);
create trigger sequence_enrollments_updated before update on public.sequence_enrollments
  for each row execute function public.tg_au_updated_at();

-- ── automation_jobs (file asynchrone) ────────────────────────────────────
create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations(id) on delete cascade,
  run_id uuid references public.automation_runs(id) on delete cascade,
  enrollment_id uuid references public.sequence_enrollments(id) on delete cascade,
  job_type text not null default 'workflow_node'
    check (job_type in ('workflow_node','sequence_step','scheduled_trigger')),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','processing','done','error','canceled')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automation_jobs_due_idx on public.automation_jobs(status, run_at);
create trigger automation_jobs_updated before update on public.automation_jobs
  for each row execute function public.tg_au_updated_at();

-- ── prospection_tasks (file Démarchage) ──────────────────────────────────
create table if not exists public.prospection_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('call','whatsapp','linkedin','email')),
  status text not null default 'pending' check (status in ('pending','done','skipped','snoozed')),
  contact_id uuid references public.contacts(id) on delete cascade,
  entreprise_id bigint references public.entreprises(id) on delete set null,
  opportunite_id uuid references public.opportunites(id) on delete set null,
  automation_id uuid references public.automations(id) on delete set null,
  enrollment_id uuid references public.sequence_enrollments(id) on delete cascade,
  step_id text,
  assignee_id uuid references public.user_profiles(id) on delete set null,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  due_at timestamptz not null default now(),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospection_tasks_queue_idx on public.prospection_tasks(status, due_at);
create index if not exists prospection_tasks_contact_idx on public.prospection_tasks(contact_id);
create trigger prospection_tasks_updated before update on public.prospection_tasks
  for each row execute function public.tg_au_updated_at();

-- ── automation_connections (intégrations) ────────────────────────────────
create table if not exists public.automation_connections (
  id text primary key,
  name text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('on','draft','manual','error')),
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger automation_connections_updated before update on public.automation_connections
  for each row execute function public.tg_au_updated_at();

-- ── tables de référence ──────────────────────────────────────────────────
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.call_scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration text,
  body text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.automation_task_types (
  id text primary key,
  name text not null,
  color text
);
create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#8A877F',
  created_at timestamptz not null default now()
);

-- ── RLS (même convention que public.opportunites) ────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'automations','automation_runs','sequence_enrollments','automation_jobs',
    'prospection_tasks','automation_connections','whatsapp_templates',
    'call_scripts','automation_task_types','crm_tags'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy au_all_authenticated on public.%I for all to public '
      || 'using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');', t);
  end loop;
end $$;

-- ── seeds ────────────────────────────────────────────────────────────────
insert into public.automation_task_types (id, name, color) values
  ('tt_call','Appel','#C8881F'),
  ('tt_wa','WhatsApp','#1F8A5B'),
  ('tt_email','Email perso','#2A6FDB'),
  ('tt_meeting','RDV','#7A5AE0'),
  ('tt_admin','Admin','#8A877F')
on conflict (id) do nothing;

insert into public.automation_connections (id, name, description, status, connected_at) values
  ('supabase','Supabase · prod','Lecture/écriture sur les tables CRM.','on', now()),
  ('resend','Resend','Envoi des emails des séquences & workflows.','on', now()),
  ('whatsapp','WhatsApp Business','Numéros pro pour les séquences WhatsApp (envoi manuel).','manual', null),
  ('slack','Slack','Notifications d''équipe (#ventes, #ops).','draft', null),
  ('calcom','Cal.com','Liens de réservation injectés dans les emails.','draft', null),
  ('linkedin','LinkedIn','Connexion manuelle — pas d''API officielle.','manual', null),
  ('claude','Claude — Anthropic','Scoring IA et génération de copy.','on', now()),
  ('webhook','Webhooks sortants','Endpoints HTTP appelés par les automatisations.','draft', null)
on conflict (id) do nothing;
