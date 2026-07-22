-- Téléphonie / centrale d'appel — schéma cœur (numéros, extensions, appels/CDR,
-- enregistrements, transcriptions, notes, tags, évaluations IA, blacklist).
-- Compatible Supabase / PostgreSQL.
-- À exécuter manuellement dans l'éditeur SQL Supabase.
--
-- FK types (vérifiés) : contacts.id = text, entreprises.id = integer,
-- opportunites.id = uuid, user_profiles.id = uuid.
--
-- RLS : admin voit tout ; un agent (freelance) voit/écrit ses propres appels
-- (agent_id = self) plus les entrants non encore attribués (agent_id IS NULL).
-- L'ingestion par webhook passe par le service-role (bypass RLS), comme Stripe.

begin;

-- 1) Numéros virtuels connectés / portés -------------------------------------
create table if not exists public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zadarma',
  provider_number_id text,
  e164 text not null,
  label text,
  country text,
  number_type text not null default 'unknown'
    check (number_type in ('landline','mobile','tollfree','unknown')),
  direction_id text,                       -- Zadarma DIRECTION_ID (achat/recherche)
  assigned_agent_id uuid references public.user_profiles(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','porting','released','inactive')),
  capabilities jsonb not null default '{}'::jsonb,   -- { voice, sms }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_numbers_provider_e164_uniq unique (provider, e164)
);
create index if not exists phone_numbers_assigned_agent_idx on public.phone_numbers (assigned_agent_id);

-- 2) Extensions PBX / logins SIP par agent (pilote le softphone + l'enregistrement)
create table if not exists public.phone_extensions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zadarma',
  agent_id uuid references public.user_profiles(id) on delete set null,
  extension text not null,
  sip text,
  record_mode text not null default 'all'
    check (record_mode in ('all','optional','off')),
  recognition_mode text not null default 'optional'
    check (recognition_mode in ('all','optional','off')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_extensions_provider_ext_uniq unique (provider, extension)
);
create index if not exists phone_extensions_agent_idx on public.phone_extensions (agent_id);

-- 3) Appels — CDR normalisé (source de vérité du reporting) -------------------
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'zadarma',
  provider_call_id text not null,
  direction text not null check (direction in ('inbound','outbound','internal')),
  disposition text check (disposition in
    ('answered','no_answer','busy','failed','cancelled','voicemail')),
  from_e164 text,
  to_e164 text,
  extension text,
  agent_id uuid references public.user_profiles(id) on delete set null,   -- null = entrant non attribué
  contact_id text references public.contacts(id) on delete set null,
  entreprise_id integer references public.entreprises(id) on delete set null,
  opportunite_id uuid references public.opportunites(id) on delete set null,
  number_id uuid references public.phone_numbers(id) on delete set null,
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  ring_sec integer,
  recording_status text not null default 'none'
    check (recording_status in ('none','pending','stored','failed')),
  recording_provider_id text,              -- Zadarma call_id_with_rec
  transcript_status text not null default 'none'
    check (transcript_status in ('none','pending','done','failed')),
  evaluation_status text not null default 'none'
    check (evaluation_status in ('none','pending','done','failed')),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calls_provider_call_uniq unique (provider, provider_call_id)
);
create index if not exists calls_agent_idx on public.calls (agent_id);
create index if not exists calls_contact_idx on public.calls (contact_id);
create index if not exists calls_entreprise_idx on public.calls (entreprise_id);
create index if not exists calls_opportunite_idx on public.calls (opportunite_id);
create index if not exists calls_started_idx on public.calls (started_at desc);
create index if not exists calls_direction_idx on public.calls (direction);

-- 4) Enregistrements (rapatriés dans Supabase Storage avant expiration du lien)
create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  provider_record_id text,                 -- Zadarma call_id_with_rec
  storage_path text,                       -- chemin dans le bucket, une fois rapatrié
  source_url text,                         -- lien provider temporaire
  source_expires_at timestamptz,
  duration_sec integer,
  bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists call_recordings_call_idx on public.call_recordings (call_id);

-- 5) Transcriptions (mots/segments horodatés, canaux séparés agent/client) -----
create table if not exists public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  provider text not null default 'zadarma',
  job_id text,
  lang text,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  phrases jsonb,                           -- [{channel,startTime,endTime,phrase}]
  words jsonb,                             -- [{channel,startTime,endTime,word,confidence}]
  full_text text,                          -- dénormalisé pour la recherche
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists call_transcripts_call_idx on public.call_transcripts (call_id);

-- 6) Notes d'appel -----------------------------------------------------------
create table if not exists public.call_notes (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  agent_id uuid references public.user_profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists call_notes_call_idx on public.call_notes (call_id);

-- 7) Tags d'appel (vocabulaire partagé) + liaison M:N ------------------------
create table if not exists public.call_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  color text not null default '#E2552B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  constraint call_tags_label_uniq unique (label)
);
create table if not exists public.call_tag_links (
  call_id uuid not null references public.calls(id) on delete cascade,
  tag_id uuid not null references public.call_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (call_id, tag_id)
);

-- 8) Évaluation IA (score/notes à partir de la transcription) -----------------
create table if not exists public.call_evaluations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.calls(id) on delete cascade,
  model text,
  score numeric,
  criteria jsonb,                          -- score par critère
  summary text,
  sentiment text,
  created_by text not null default 'anthropic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists call_evaluations_call_idx on public.call_evaluations (call_id);

-- 9) Blacklist des numéros (distinct de l'url_blacklist existante) ------------
create table if not exists public.phone_blacklist (
  id uuid primary key default gen_random_uuid(),
  e164 text not null unique,
  reason text,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 10) Triggers updated_at (réutilise public.set_updated_at) -------------------
do $$
declare t text;
begin
  foreach t in array array[
    'phone_numbers','phone_extensions','calls','call_recordings',
    'call_transcripts','call_notes','call_evaluations'
  ] loop
    execute format('drop trigger if exists trg_%1$s_set_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_set_updated_at before update on public.%1$s '
      'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- 11) RLS --------------------------------------------------------------------
alter table public.phone_numbers      enable row level security;
alter table public.phone_extensions   enable row level security;
alter table public.calls              enable row level security;
alter table public.call_recordings    enable row level security;
alter table public.call_transcripts   enable row level security;
alter table public.call_notes         enable row level security;
alter table public.call_tags          enable row level security;
alter table public.call_tag_links     enable row level security;
alter table public.call_evaluations   enable row level security;
alter table public.phone_blacklist    enable row level security;

-- Config tables : admin gère tout ; l'agent lit ce qui le concerne.
drop policy if exists "admin all phone_numbers" on public.phone_numbers;
create policy "admin all phone_numbers" on public.phone_numbers
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own phone_numbers" on public.phone_numbers;
create policy "freelance read own phone_numbers" on public.phone_numbers
  for select using (public.is_freelance() and assigned_agent_id = (select auth.uid()));

drop policy if exists "admin all phone_extensions" on public.phone_extensions;
create policy "admin all phone_extensions" on public.phone_extensions
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own phone_extensions" on public.phone_extensions;
create policy "freelance read own phone_extensions" on public.phone_extensions
  for select using (public.is_freelance() and agent_id = (select auth.uid()));

drop policy if exists "admin all call_tags" on public.call_tags;
create policy "admin all call_tags" on public.call_tags
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read call_tags" on public.call_tags;
create policy "freelance read call_tags" on public.call_tags
  for select using (public.is_freelance());

drop policy if exists "admin all phone_blacklist" on public.phone_blacklist;
create policy "admin all phone_blacklist" on public.phone_blacklist
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read phone_blacklist" on public.phone_blacklist;
create policy "freelance read phone_blacklist" on public.phone_blacklist
  for select using (public.is_freelance());

-- calls : admin tout ; agent ses appels (ou entrants non attribués).
drop policy if exists "admin all calls" on public.calls;
create policy "admin all calls" on public.calls
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own calls" on public.calls;
create policy "freelance read own calls" on public.calls
  for select using (
    public.is_freelance() and (agent_id = (select auth.uid()) or agent_id is null)
  );
drop policy if exists "freelance insert own calls" on public.calls;
create policy "freelance insert own calls" on public.calls
  for insert with check (public.is_freelance() and agent_id = (select auth.uid()));
drop policy if exists "freelance update own calls" on public.calls;
create policy "freelance update own calls" on public.calls
  for update using (
    public.is_freelance() and (agent_id = (select auth.uid()) or agent_id is null)
  ) with check (public.is_freelance() and agent_id = (select auth.uid()));

-- Tables filles : admin tout ; agent lit si l'appel parent est le sien.
do $$
declare t text;
begin
  foreach t in array array[
    'call_recordings','call_transcripts','call_evaluations','call_tag_links'
  ] loop
    execute format('drop policy if exists "admin all %1$s" on public.%1$s;', t);
    execute format(
      'create policy "admin all %1$s" on public.%1$s '
      'for all using (public.is_admin()) with check (public.is_admin());', t);
    execute format('drop policy if exists "freelance read own %1$s" on public.%1$s;', t);
    execute format(
      'create policy "freelance read own %1$s" on public.%1$s for select using ('
      '  public.is_freelance() and exists ('
      '    select 1 from public.calls c where c.id = %1$s.call_id '
      '    and (c.agent_id = (select auth.uid()) or c.agent_id is null)));', t);
  end loop;
end $$;

-- call_notes : agent gère ses propres notes.
drop policy if exists "admin all call_notes" on public.call_notes;
create policy "admin all call_notes" on public.call_notes
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own call_notes" on public.call_notes;
create policy "freelance read own call_notes" on public.call_notes
  for select using (
    public.is_freelance() and exists (
      select 1 from public.calls c where c.id = call_notes.call_id
        and (c.agent_id = (select auth.uid()) or c.agent_id is null)));
drop policy if exists "freelance insert own call_notes" on public.call_notes;
create policy "freelance insert own call_notes" on public.call_notes
  for insert with check (public.is_freelance() and agent_id = (select auth.uid()));
drop policy if exists "freelance update own call_notes" on public.call_notes;
create policy "freelance update own call_notes" on public.call_notes
  for update using (public.is_freelance() and agent_id = (select auth.uid()))
  with check (public.is_freelance() and agent_id = (select auth.uid()));

-- 12) Realtime : pousser les changements d'appels vers le navigateur ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calls'
  ) then
    alter publication supabase_realtime add table public.calls;
  end if;
end $$;

commit;
