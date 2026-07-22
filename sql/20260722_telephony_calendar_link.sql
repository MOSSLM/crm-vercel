-- Téléphonie — RDV intégrés : relie les évènements du calendrier CRM aux
-- agents, contacts, entreprises, opportunités et appels, et permet d'assigner
-- un RDV à l'agent OU au supérieur (admin).
-- À exécuter manuellement dans l'éditeur SQL Supabase.

begin;

alter table public.crm_calendar_events
  add column if not exists assigned_to uuid references public.user_profiles(id) on delete set null,
  add column if not exists created_for_role text not null default 'admin'
    check (created_for_role in ('admin','freelance')),
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists entreprise_id integer references public.entreprises(id) on delete set null,
  add column if not exists opportunite_id uuid references public.opportunites(id) on delete set null,
  add column if not exists call_id uuid references public.calls(id) on delete set null;

create index if not exists crm_calendar_events_assigned_to_idx on public.crm_calendar_events (assigned_to);
create index if not exists crm_calendar_events_contact_idx on public.crm_calendar_events (contact_id);
create index if not exists crm_calendar_events_entreprise_idx on public.crm_calendar_events (entreprise_id);

commit;
