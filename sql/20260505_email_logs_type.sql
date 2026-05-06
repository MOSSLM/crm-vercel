-- ============================================================
-- Add type column to email_logs for workflow filtering
-- ============================================================

alter table public.email_logs
  add column if not exists type text;

create index if not exists idx_email_logs_type
  on public.email_logs(type);

-- ============================================================
-- Update email_sent trigger to support email_type condition
-- ============================================================

create or replace function public.process_workflow_on_email_sent()
returns trigger language plpgsql as $$
declare
  workflow        record;
  action_item     jsonb;
  cond_email_type text;
begin
  if new.opportunite_id is null then
    return new;
  end if;

  for workflow in
    select * from public.crm_workflows
    where trigger_type = 'email_sent' and active = true
  loop
    -- Filter by email_type condition if specified
    cond_email_type := workflow.trigger_conditions->>'email_type';
    if cond_email_type is not null
       and cond_email_type <> ''
       and cond_email_type <> coalesce(new.type, '') then
      continue;
    end if;

    for action_item in
      select * from jsonb_array_elements(workflow.actions)
    loop
      perform public._execute_workflow_action(
        action_item, new.opportunite_id, workflow.id,
        jsonb_build_object(
          'to_email',   new.to_email,
          'subject',    new.subject,
          'email_type', new.type
        )
      );
    end loop;

    insert into public.crm_workflow_executions
      (workflow_id, opportunite_id, trigger_data, status, actions_executed)
    values (
      workflow.id, new.opportunite_id,
      jsonb_build_object(
        'email_log_id', new.id,
        'to_email',     new.to_email,
        'subject',      new.subject,
        'email_type',   new.type
      ),
      'completed',
      workflow.actions
    );
  end loop;

  return new;
end;
$$;
