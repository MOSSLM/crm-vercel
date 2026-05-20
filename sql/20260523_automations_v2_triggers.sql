-- Déclencheurs SQL des automatisations : enfile un job 'scheduled_trigger'
-- dans automation_jobs sur les événements CRM (le ticker le traite).
-- Appliqué via Supabase MCP (migration automations_v2_event_triggers).

create or replace function public.tg_automation_event()
returns trigger language plpgsql security definer as $$
begin
  if (TG_TABLE_NAME = 'opportunites') then
    if (TG_OP = 'INSERT') then
      insert into public.automation_jobs(job_type, payload, run_at, status)
      values ('scheduled_trigger',
        jsonb_build_object('event','opportunity_created','opportunite_id',NEW.id,
          'pipeline_id',NEW.pipeline_id,'stage_id',NEW.stage_id,
          'contact_id',NEW.contact_id,'entreprise_id',NEW.entreprise_id),
        now(), 'pending');
    elsif (TG_OP = 'UPDATE' and NEW.stage_id is distinct from OLD.stage_id) then
      insert into public.automation_jobs(job_type, payload, run_at, status)
      values ('scheduled_trigger',
        jsonb_build_object('event','stage_changed','opportunite_id',NEW.id,
          'pipeline_id',NEW.pipeline_id,'stage_id',NEW.stage_id,'from_stage_id',OLD.stage_id,
          'contact_id',NEW.contact_id,'entreprise_id',NEW.entreprise_id),
        now(), 'pending');
    end if;
  elsif (TG_TABLE_NAME = 'contacts' and TG_OP = 'INSERT') then
    insert into public.automation_jobs(job_type, payload, run_at, status)
    values ('scheduled_trigger',
      jsonb_build_object('event','contact_created','contact_id',NEW.id,'entreprise_id',NEW.entreprise_id),
      now(), 'pending');
  end if;
  return NEW;
end; $$;

drop trigger if exists automations_opp_ins on public.opportunites;
create trigger automations_opp_ins after insert on public.opportunites
  for each row execute function public.tg_automation_event();

drop trigger if exists automations_opp_upd on public.opportunites;
create trigger automations_opp_upd after update on public.opportunites
  for each row execute function public.tg_automation_event();

drop trigger if exists automations_contact_ins on public.contacts;
create trigger automations_contact_ins after insert on public.contacts
  for each row execute function public.tg_automation_event();
