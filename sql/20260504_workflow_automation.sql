-- ============================================================
-- Workflow Automation System
-- ============================================================
-- Tables:
--   opportunite_offres          — multi-offer tracking per opportunity
--   opportunite_tasks           — opportunity-linked follow-up tasks
--   crm_workflows               — automation rule definitions
--   crm_workflow_executions     — execution audit log
--   crm_workflow_scheduled_actions — deferred actions (delay_days > 0)
--
-- Trigger engine (PL/pgSQL):
--   stage_changed       → trg_workflow_stage_change
--   opportunite_created → trg_workflow_opportunite_created
--   email_sent          → trg_workflow_email_sent  (fires on email_logs INSERT)
--   offre_accepted      → trg_workflow_offre_accepted
-- ============================================================

-- ── 1. Multi-offer tracking ──────────────────────────────────
create table if not exists public.opportunite_offres (
  id             uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunites(id) on delete cascade,
  offre_id       uuid references public.offres(id),
  offre_nom      text not null,
  offre_prix_ht  numeric,
  statut         text not null default 'proposee'
                   check (statut in ('proposee', 'acceptee', 'refusee', 'en_cours')),
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_opp_offres_opportunite
  on public.opportunite_offres(opportunite_id);

-- ── 2. Opportunity-linked tasks ──────────────────────────────
create table if not exists public.opportunite_tasks (
  id             uuid primary key default gen_random_uuid(),
  opportunite_id uuid not null references public.opportunites(id) on delete cascade,
  entreprise_id  integer references public.entreprises(id),
  titre          text not null,
  description    text,
  type           text not null default 'relance'
                   check (type in ('relance', 'appel', 'email', 'rdv', 'autre')),
  statut         text not null default 'a_faire'
                   check (statut in ('a_faire', 'fait', 'annule')),
  due_date       timestamptz,
  assigned_to    text,
  workflow_id    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_opp_tasks_opportunite
  on public.opportunite_tasks(opportunite_id);
create index if not exists idx_opp_tasks_due_date
  on public.opportunite_tasks(due_date, statut);

-- ── 3. Workflow definitions ───────────────────────────────────
create table if not exists public.crm_workflows (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  trigger_type       text not null
                       check (trigger_type in (
                         'stage_changed',
                         'opportunite_created',
                         'email_sent',
                         'offre_accepted'
                       )),
  -- trigger_conditions examples:
  --   stage_changed:       {"to_stage_name": "Signé"}
  --   email_sent:          {}   (fires on every email linked to an opportunity)
  --   offre_accepted:      {}   (fires on any offer accepted)
  trigger_conditions jsonb not null default '{}',
  -- actions array — each item:
  --   {"type": "create_task", "delay_days": 3,
  --    "params": {"titre": "Appel relance", "type": "appel", "description": "..."}}
  --   {"type": "add_note",    "delay_days": 0,
  --    "params": {"content": "Note automatique"}}
  actions            jsonb not null default '[]',
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_crm_workflows_trigger
  on public.crm_workflows(trigger_type, active);

-- ── 4. Workflow execution audit log ──────────────────────────
create table if not exists public.crm_workflow_executions (
  id               uuid primary key default gen_random_uuid(),
  workflow_id      uuid not null references public.crm_workflows(id) on delete cascade,
  opportunite_id   uuid references public.opportunites(id),
  trigger_data     jsonb,
  status           text not null default 'completed'
                     check (status in ('completed', 'failed', 'partial')),
  actions_executed jsonb default '[]',
  error            text,
  executed_at      timestamptz not null default now()
);

-- ── 5. Scheduled (deferred) actions ─────────────────────────
create table if not exists public.crm_workflow_scheduled_actions (
  id             uuid primary key default gen_random_uuid(),
  workflow_id    uuid not null references public.crm_workflows(id) on delete cascade,
  opportunite_id uuid references public.opportunites(id),
  action         jsonb not null,
  context_data   jsonb,
  scheduled_for  timestamptz not null,
  status         text not null default 'pending'
                   check (status in ('pending', 'executed', 'cancelled')),
  created_at     timestamptz not null default now()
);

create index if not exists idx_scheduled_actions_due
  on public.crm_workflow_scheduled_actions(scheduled_for, status);

-- ── updated_at triggers ──────────────────────────────────────
create trigger set_updated_at_opp_tasks
  before update on public.opportunite_tasks
  for each row execute function set_updated_at();

create trigger set_updated_at_crm_workflows
  before update on public.crm_workflows
  for each row execute function set_updated_at();

-- ============================================================
-- WORKFLOW ENGINE — PL/pgSQL trigger functions
-- ============================================================

-- Helper: execute one workflow action for an opportunity.
-- If delay_days > 0, inserts into crm_workflow_scheduled_actions instead.
create or replace function public._execute_workflow_action(
  p_action         jsonb,
  p_opportunite_id uuid,
  p_workflow_id    uuid,
  p_context        jsonb default '{}'
) returns void language plpgsql as $$
declare
  delay_days        int;
  opp_entreprise_id integer;
begin
  delay_days := coalesce((p_action->>'delay_days')::int, 0);

  select entreprise_id into opp_entreprise_id
  from public.opportunites
  where id = p_opportunite_id;

  if p_action->>'type' = 'create_task' then
    if delay_days > 0 then
      insert into public.crm_workflow_scheduled_actions
        (workflow_id, opportunite_id, action, context_data, scheduled_for)
      values (
        p_workflow_id,
        p_opportunite_id,
        p_action,
        p_context,
        now() + (delay_days || ' days')::interval
      );
    else
      insert into public.opportunite_tasks
        (opportunite_id, entreprise_id, titre, description, type, due_date, workflow_id)
      values (
        p_opportunite_id,
        opp_entreprise_id,
        p_action->'params'->>'titre',
        p_action->'params'->>'description',
        coalesce(p_action->'params'->>'type', 'relance'),
        now(),
        p_workflow_id
      );
    end if;

  elsif p_action->>'type' = 'add_note' then
    insert into public.opportunite_notes (opportunite_id, theme, contenu)
    values (p_opportunite_id, 'autre', p_action->'params'->>'content');
  end if;
end;
$$;

-- ── Trigger function: stage_changed ──────────────────────────
create or replace function public.process_workflow_on_stage_change()
returns trigger language plpgsql as $$
declare
  workflow        record;
  action_item     jsonb;
  stage_name      text;
  cond_stage_name text;
begin
  -- Only act when stage_id actually changed
  if old.stage_id is not distinct from new.stage_id then
    return new;
  end if;

  select nom into stage_name
  from public.etapes_pipeline
  where id = new.stage_id;

  for workflow in
    select * from public.crm_workflows
    where trigger_type = 'stage_changed' and active = true
  loop
    cond_stage_name := workflow.trigger_conditions->>'to_stage_name';
    if cond_stage_name is not null and cond_stage_name <> stage_name then
      continue;
    end if;

    for action_item in
      select * from jsonb_array_elements(workflow.actions)
    loop
      perform public._execute_workflow_action(
        action_item, new.id, workflow.id,
        jsonb_build_object(
          'to_stage_name', stage_name,
          'from_stage_id', old.stage_id,
          'to_stage_id',   new.stage_id
        )
      );
    end loop;

    insert into public.crm_workflow_executions
      (workflow_id, opportunite_id, trigger_data, status, actions_executed)
    values (
      workflow.id, new.id,
      jsonb_build_object(
        'from_stage_id', old.stage_id,
        'to_stage_id',   new.stage_id,
        'to_stage_name', stage_name
      ),
      'completed',
      workflow.actions
    );
  end loop;

  return new;
end;
$$;

create trigger trg_workflow_stage_change
  after update of stage_id on public.opportunites
  for each row execute function public.process_workflow_on_stage_change();

-- ── Trigger function: opportunite_created ────────────────────
create or replace function public.process_workflow_on_opportunite_created()
returns trigger language plpgsql as $$
declare
  workflow    record;
  action_item jsonb;
begin
  for workflow in
    select * from public.crm_workflows
    where trigger_type = 'opportunite_created' and active = true
  loop
    for action_item in
      select * from jsonb_array_elements(workflow.actions)
    loop
      perform public._execute_workflow_action(
        action_item, new.id, workflow.id, '{}'::jsonb
      );
    end loop;

    insert into public.crm_workflow_executions
      (workflow_id, opportunite_id, trigger_data, status, actions_executed)
    values (
      workflow.id, new.id,
      jsonb_build_object('opportunite_id', new.id),
      'completed',
      workflow.actions
    );
  end loop;

  return new;
end;
$$;

create trigger trg_workflow_opportunite_created
  after insert on public.opportunites
  for each row execute function public.process_workflow_on_opportunite_created();

-- ── Trigger function: email_sent ─────────────────────────────
-- Fires on every INSERT into email_logs that has an opportunite_id.
create or replace function public.process_workflow_on_email_sent()
returns trigger language plpgsql as $$
declare
  workflow    record;
  action_item jsonb;
begin
  if new.opportunite_id is null then
    return new;
  end if;

  for workflow in
    select * from public.crm_workflows
    where trigger_type = 'email_sent' and active = true
  loop
    for action_item in
      select * from jsonb_array_elements(workflow.actions)
    loop
      perform public._execute_workflow_action(
        action_item, new.opportunite_id, workflow.id,
        jsonb_build_object('to_email', new.to_email, 'subject', new.subject)
      );
    end loop;

    insert into public.crm_workflow_executions
      (workflow_id, opportunite_id, trigger_data, status, actions_executed)
    values (
      workflow.id, new.opportunite_id,
      jsonb_build_object(
        'email_log_id', new.id,
        'to_email',     new.to_email,
        'subject',      new.subject
      ),
      'completed',
      workflow.actions
    );
  end loop;

  return new;
end;
$$;

create trigger trg_workflow_email_sent
  after insert on public.email_logs
  for each row execute function public.process_workflow_on_email_sent();

-- ── Trigger function: offre_accepted ─────────────────────────
-- Fires when opportunite_offres.statut transitions to 'acceptee'.
create or replace function public.process_workflow_on_offre_accepted()
returns trigger language plpgsql as $$
declare
  workflow    record;
  action_item jsonb;
begin
  if new.statut <> 'acceptee' or old.statut = 'acceptee' then
    return new;
  end if;

  for workflow in
    select * from public.crm_workflows
    where trigger_type = 'offre_accepted' and active = true
  loop
    for action_item in
      select * from jsonb_array_elements(workflow.actions)
    loop
      perform public._execute_workflow_action(
        action_item, new.opportunite_id, workflow.id,
        jsonb_build_object('offre_nom', new.offre_nom, 'offre_id', new.offre_id)
      );
    end loop;

    insert into public.crm_workflow_executions
      (workflow_id, opportunite_id, trigger_data, status, actions_executed)
    values (
      workflow.id, new.opportunite_id,
      jsonb_build_object('offre_nom', new.offre_nom, 'offre_id', new.offre_id),
      'completed',
      workflow.actions
    );
  end loop;

  return new;
end;
$$;

create trigger trg_workflow_offre_accepted
  after update of statut on public.opportunite_offres
  for each row execute function public.process_workflow_on_offre_accepted();

-- ============================================================
-- DEFAULT WORKFLOW SEEDS
-- ============================================================
insert into public.crm_workflows (name, description, trigger_type, trigger_conditions, actions)
values
  (
    'Relance J+3 après email',
    'Crée une tâche d''appel 3 jours après l''envoi d''un email lié à une opportunité',
    'email_sent',
    '{}',
    '[{"type":"create_task","delay_days":3,"params":{"titre":"Appel relance","type":"appel","description":"Relancer le prospect suite à l''envoi de l''email"}}]'
  ),
  (
    'Onboarding à la signature',
    'Crée une tâche d''onboarding et une note quand une opportunité passe dans l''étape Signé',
    'stage_changed',
    '{"to_stage_name": "Signé"}',
    '[{"type":"create_task","delay_days":0,"params":{"titre":"Onboarding client","type":"rdv","description":"Planifier le kickoff avec le nouveau client"}},{"type":"add_note","delay_days":0,"params":{"content":"Workflow onboarding déclenché automatiquement à la signature"}}]'
  )
on conflict do nothing;
