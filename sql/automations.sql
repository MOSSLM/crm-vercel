-- =====================================================
-- Automations module — Supabase migration
-- Run this in the Supabase SQL editor
-- =====================================================

-- Main automations table
create table if not exists public.automations (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  name          text        not null default 'Nouvelle automatisation',
  description   text        not null default '',
  is_active     boolean     not null default false,
  -- ReactFlow graph stored as JSON
  nodes         jsonb       not null default '[]'::jsonb,
  edges         jsonb       not null default '[]'::jsonb,
  run_count     integer     not null default 0,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists automations_user_id_idx   on public.automations(user_id);
create index if not exists automations_is_active_idx on public.automations(is_active);

alter table public.automations enable row level security;

create policy "Users can manage their own automations"
  on public.automations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================
-- Automation run log
-- Each execution of an automation creates one row here
-- =====================================================

create table if not exists public.automation_runs (
  id               uuid        default gen_random_uuid() primary key,
  automation_id    uuid        references public.automations(id) on delete cascade not null,
  status           text        not null check (status in ('pending', 'running', 'success', 'error')),
  trigger_payload  jsonb       not null default '{}'::jsonb,
  steps_log        jsonb       not null default '[]'::jsonb,
  error_message    text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);

create index if not exists automation_runs_automation_id_idx on public.automation_runs(automation_id);
create index if not exists automation_runs_status_idx        on public.automation_runs(status);
create index if not exists automation_runs_started_at_idx    on public.automation_runs(started_at desc);

alter table public.automation_runs enable row level security;

create policy "Users can view runs for their automations"
  on public.automation_runs for select
  using (
    exists (
      select 1 from public.automations
      where id = automation_runs.automation_id
        and user_id = auth.uid()
    )
  );

-- =====================================================
-- Auto-update updated_at trigger
-- =====================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists automations_set_updated_at on public.automations;
create trigger automations_set_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();

-- =====================================================
-- Edge Function invocation helper (Supabase RPC)
-- Call this from a Supabase Edge Function or via the
-- automation engine to increment the run counter
-- =====================================================

create or replace function public.increment_automation_run_count(p_automation_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.automations
  set run_count  = run_count + 1,
      last_run_at = now()
  where id = p_automation_id;
end;
$$;

-- =====================================================
-- HOW TO WIRE THE EDGE FUNCTION NODE
-- =====================================================
-- When the automation engine processes a supabase_edge_function node:
--
-- const { data, error } = await supabase.functions.invoke(node.config.functionName, {
--   body: resolveTemplate(node.config.payload, context),
-- })
--
-- The edge function receives the resolved payload and can access
-- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from env vars.
--
-- Deploy a function:  supabase functions deploy <name>
-- =====================================================
