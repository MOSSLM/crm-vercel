-- Téléphonie — SMS (fils de discussion + messages).
-- À exécuter manuellement dans l'éditeur SQL Supabase.
--
-- Envoi/réception de SMS, organisés en fils par correspondant. L'ingestion des
-- SMS entrants (webhook) et l'envoi (API) passent par le service-role. RLS :
-- admin voit tout ; l'agent voit ses fils (agent_id = self) et leurs messages.

begin;

-- 1) Fils de discussion (un par correspondant / agent) -----------------------
create table if not exists public.sms_threads (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zadarma',
  counterpart_e164 text not null,
  our_number_id uuid references public.phone_numbers(id) on delete set null,
  agent_id uuid references public.user_profiles(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  entreprise_id integer references public.entreprises(id) on delete set null,
  last_message_at timestamptz,
  last_snippet text,
  unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sms_threads_counterpart_idx on public.sms_threads (counterpart_e164);
create index if not exists sms_threads_agent_idx on public.sms_threads (agent_id);
create index if not exists sms_threads_contact_idx on public.sms_threads (contact_id);
create index if not exists sms_threads_entreprise_idx on public.sms_threads (entreprise_id);
create index if not exists sms_threads_last_msg_idx on public.sms_threads (last_message_at desc);

-- 2) Messages ----------------------------------------------------------------
create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sms_threads(id) on delete cascade,
  provider text not null default 'zadarma',
  provider_message_id text,
  direction text not null check (direction in ('inbound','outbound')),
  from_e164 text,
  to_e164 text,
  body text not null,
  status text not null default 'sent'
    check (status in ('queued','sent','delivered','failed','received')),
  agent_id uuid references public.user_profiles(id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists sms_messages_thread_idx on public.sms_messages (thread_id, sent_at);

-- 3) updated_at trigger ------------------------------------------------------
drop trigger if exists trg_sms_threads_set_updated_at on public.sms_threads;
create trigger trg_sms_threads_set_updated_at
  before update on public.sms_threads
  for each row execute function public.set_updated_at();

-- 4) RLS ---------------------------------------------------------------------
alter table public.sms_threads  enable row level security;
alter table public.sms_messages enable row level security;

drop policy if exists "admin all sms_threads" on public.sms_threads;
create policy "admin all sms_threads" on public.sms_threads
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own sms_threads" on public.sms_threads;
create policy "freelance read own sms_threads" on public.sms_threads
  for select using (
    public.is_freelance() and (agent_id = (select auth.uid()) or agent_id is null)
  );

drop policy if exists "admin all sms_messages" on public.sms_messages;
create policy "admin all sms_messages" on public.sms_messages
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own sms_messages" on public.sms_messages;
create policy "freelance read own sms_messages" on public.sms_messages
  for select using (
    public.is_freelance() and exists (
      select 1 from public.sms_threads t
      where t.id = sms_messages.thread_id
        and (t.agent_id = (select auth.uid()) or t.agent_id is null)));

-- 5) Realtime ----------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sms_messages'
  ) then
    alter publication supabase_realtime add table public.sms_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sms_threads'
  ) then
    alter publication supabase_realtime add table public.sms_threads;
  end if;
end $$;

commit;
