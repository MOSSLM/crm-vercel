-- Module Rendez-vous (clone Cal.com / Calendly intégré au CRM).
--
-- Un hôte (admin ou agent freelance) configure ses règles de disponibilité et
-- ses types d'évènements ; sa page publique /rdv/{username} permet à un invité
-- SANS COMPTE de réserver un créneau. Le booking est créé en base avec une
-- contrainte d'EXCLUSION (btree_gist) qui rend le double-booking impossible au
-- niveau PostgreSQL — pas seulement en applicatif.
--
-- Tout est stocké en UTC (timestamptz) ; les règles hebdomadaires sont des
-- minutes-depuis-minuit DANS le fuseau du planning (converties par date côté
-- app, donc insensibles aux changements d'heure).
--
-- FK types (vérifiés en base) : contacts.id = uuid, entreprises.id = integer,
-- user_profiles.id = uuid, calls.id = uuid, crm_calendar_events.id = uuid.
--
-- RLS : admin voit tout ; un agent (freelance) gère ses propres ressources
-- (user_id = self). Le parcours public (lecture des créneaux, création de
-- booking, gestion par token) passe par les routes /api/public/scheduling/*
-- en service-role — aucune table n'est lisible par anon.
-- Les connexions d'agenda externes (tokens OAuth) ne sont accessibles QUE via
-- service-role : RLS activée sans aucune policy.
--
-- À exécuter manuellement dans l'éditeur SQL Supabase.

begin;

-- Contrainte d'exclusion sur (uuid, tstzrange) → nécessite btree_gist.
create extension if not exists btree_gist;

-- 1) Page publique de réservation (une par hôte) ------------------------------
create table if not exists public.scheduling_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  username text not null,                  -- slug public : /rdv/{username}
  display_name text not null,
  bio text,
  avatar_url text,
  brand_color text not null default '#2A6FDB',
  timezone text not null default 'Europe/Paris',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_pages_user_uniq unique (user_id),
  constraint scheduling_pages_username_format check (username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint scheduling_pages_username_len check (char_length(username) between 3 and 48),
  constraint scheduling_pages_color_hex check (brand_color ~ '^#[0-9A-Fa-f]{6}$')
);
create unique index if not exists scheduling_pages_username_uniq
  on public.scheduling_pages (lower(username));

-- 2) Plannings de disponibilité ----------------------------------------------
create table if not exists public.scheduling_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null default 'Horaires de travail',
  timezone text not null default 'Europe/Paris',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduling_schedules_user_idx on public.scheduling_schedules (user_id);
-- Un seul planning par défaut par hôte.
create unique index if not exists scheduling_schedules_default_uniq
  on public.scheduling_schedules (user_id) where is_default;

-- Plages récurrentes par jour de semaine (minutes depuis minuit, fuseau du planning).
create table if not exists public.scheduling_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.scheduling_schedules(id) on delete cascade,
  weekday smallint not null,               -- ISO 1=lun .. 7=dim
  start_minute smallint not null,          -- 0..1439
  end_minute smallint not null,            -- 1..1440
  created_at timestamptz not null default now(),
  constraint scheduling_schedule_rules_weekday check (weekday between 1 and 7),
  constraint scheduling_schedule_rules_bounds check (
    start_minute >= 0 and end_minute <= 1440 and end_minute > start_minute
  )
);
create index if not exists scheduling_schedule_rules_schedule_idx
  on public.scheduling_schedule_rules (schedule_id, weekday);

-- Exceptions par date : jour bloqué (congés) ou horaires spécifiques ce jour-là.
create table if not exists public.scheduling_date_overrides (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.scheduling_schedules(id) on delete cascade,
  date date not null,
  is_unavailable boolean not null default false,
  -- Quand is_unavailable = false : plages remplaçant les règles hebdo ce jour.
  -- [{"startMinute": 540, "endMinute": 720}, …]
  ranges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_date_overrides_uniq unique (schedule_id, date)
);

-- 3) Types d'évènements (les "liens" réservables) -----------------------------
create table if not exists public.scheduling_event_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  schedule_id uuid references public.scheduling_schedules(id) on delete set null,
  slug text not null,
  title text not null,
  description text,
  duration_minutes integer not null default 30,
  -- Grille de départ des créneaux ; null = durée de l'évènement.
  slot_interval_minutes integer,
  location_type text not null default 'google_meet'
    check (location_type in ('google_meet','zoom','teams','phone','in_person','custom')),
  -- Adresse (présentiel), URL fixe (zoom/teams), ou texte libre (custom).
  location_details text,
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 0,
  minimum_notice_minutes integer not null default 240,   -- préavis mini (4 h)
  booking_window_days integer not null default 60,       -- fenêtre max de résa
  max_bookings_per_day integer,                          -- null = illimité
  max_bookings_per_week integer,
  requires_confirmation boolean not null default false,  -- validation manuelle
  -- Questions custom posées à l'invité :
  -- [{"id","label","type":"text|textarea|select|checkbox|phone","required":bool,"options":[…]}]
  custom_questions jsonb not null default '[]'::jsonb,
  -- Rappels email avant le RDV, en minutes (ex. veille + 1 h avant).
  reminder_minutes integer[] not null default '{1440,60}',
  color text,
  price_cents integer,                                   -- Stripe optionnel
  currency text not null default 'eur',
  success_redirect_url text,                             -- redirection post-résa (embeds)
  is_active boolean not null default true,
  position integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_event_types_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint scheduling_event_types_slug_uniq unique (user_id, slug),
  constraint scheduling_event_types_duration check (duration_minutes between 5 and 1440),
  constraint scheduling_event_types_interval check (
    slot_interval_minutes is null or slot_interval_minutes between 5 and 1440
  ),
  constraint scheduling_event_types_buffers check (
    buffer_before_minutes between 0 and 720 and buffer_after_minutes between 0 and 720
  ),
  constraint scheduling_event_types_notice check (minimum_notice_minutes >= 0),
  constraint scheduling_event_types_window check (booking_window_days between 1 and 730),
  constraint scheduling_event_types_limits check (
    (max_bookings_per_day is null or max_bookings_per_day >= 1)
    and (max_bookings_per_week is null or max_bookings_per_week >= 1)
  ),
  constraint scheduling_event_types_color_hex check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint scheduling_event_types_price check (price_cents is null or price_cents >= 0)
);
create index if not exists scheduling_event_types_user_idx
  on public.scheduling_event_types (user_id, position);

-- 4) Réservations -------------------------------------------------------------
create table if not exists public.scheduling_bookings (
  id uuid primary key default gen_random_uuid(),
  -- Hôte dénormalisé : porte la contrainte anti-chevauchement + la RLS.
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  event_type_id uuid references public.scheduling_event_types(id) on delete set null,
  -- Snapshot au moment de la résa (survit à la suppression du type d'évènement).
  event_title text not null,
  location_type text not null default 'custom',
  location_text text,                      -- adresse / consigne résolue
  meeting_url text,                        -- lien visio résolu
  start_at timestamptz not null,           -- UTC
  end_at timestamptz not null,             -- UTC
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','cancelled','declined')),
  invitee_name text not null,
  invitee_email text not null,
  invitee_phone text,
  invitee_notes text,
  invitee_timezone text not null default 'Europe/Paris',
  additional_guests text[] not null default '{}',        -- emails en copie
  -- Réponses aux questions custom : [{"id","label","value"}]
  answers jsonb not null default '[]'::jsonb,
  -- Jeton opaque : liens publics de reprogrammation / annulation.
  manage_token text not null,
  -- Liens CRM.
  contact_id uuid references public.contacts(id) on delete set null,
  entreprise_id integer references public.entreprises(id) on delete set null,
  opportunite_id uuid references public.opportunites(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  calendar_event_id uuid references public.crm_calendar_events(id) on delete set null,
  google_event_id text,                    -- id de l'évènement Google créé
  rescheduled_from_id uuid references public.scheduling_bookings(id) on delete set null,
  source text not null default 'public'
    check (source in ('public','embed','agent','api')),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('invitee','host')),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_bookings_time_order check (end_at > start_at),
  constraint scheduling_bookings_token_uniq unique (manage_token),
  -- LE verrou anti double-booking : deux résas actives (pending/confirmed) du
  -- même hôte ne peuvent pas se chevaucher. Garanti par l'index GiST même sous
  -- deux transactions concurrentes — l'API attrape l'erreur 23P01 et renvoie
  -- « créneau déjà pris ».
  constraint scheduling_bookings_no_overlap exclude using gist (
    user_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status in ('pending','confirmed'))
);
create index if not exists scheduling_bookings_user_start_idx
  on public.scheduling_bookings (user_id, start_at desc);
create index if not exists scheduling_bookings_event_type_idx
  on public.scheduling_bookings (event_type_id);
create index if not exists scheduling_bookings_status_idx
  on public.scheduling_bookings (status, start_at);
create index if not exists scheduling_bookings_contact_idx
  on public.scheduling_bookings (contact_id);
create index if not exists scheduling_bookings_entreprise_idx
  on public.scheduling_bookings (entreprise_id);
create index if not exists scheduling_bookings_call_idx
  on public.scheduling_bookings (call_id);
create index if not exists scheduling_bookings_calendar_event_idx
  on public.scheduling_bookings (calendar_event_id);
create index if not exists scheduling_bookings_invitee_email_idx
  on public.scheduling_bookings (lower(invitee_email));

-- 5) Rappels programmés -------------------------------------------------------
create table if not exists public.scheduling_booking_reminders (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.scheduling_bookings(id) on delete cascade,
  send_at timestamptz not null,
  recipient text not null default 'both' check (recipient in ('invitee','host','both')),
  status text not null default 'pending'
    check (status in ('pending','sent','cancelled','failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduling_booking_reminders_due_idx
  on public.scheduling_booking_reminders (status, send_at);
create index if not exists scheduling_booking_reminders_booking_idx
  on public.scheduling_booking_reminders (booking_id);

-- 6) Connexions d'agendas externes (OAuth Google / Microsoft) -----------------
create table if not exists public.scheduling_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  provider text not null check (provider in ('google','microsoft')),
  account_email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  -- Agenda cible pour l'écriture des évènements.
  write_calendar_id text not null default 'primary',
  -- Agendas lus pour le calcul du busy.
  busy_calendar_ids text[] not null default '{primary}',
  sync_enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduling_calendar_connections_uniq unique (user_id, provider, account_email)
);
create index if not exists scheduling_calendar_connections_user_idx
  on public.scheduling_calendar_connections (user_id);

-- 7) RPC : reprogrammation atomique ------------------------------------------
-- Annule l'ancien booking et insère le nouveau DANS LA MÊME TRANSACTION :
-- si le nouveau créneau est pris, la contrainte d'exclusion fait tout
-- rollback et l'ancien booking reste actif. Appelée via service-role
-- uniquement (revoke anon/authenticated ci-dessous).
create or replace function public.scheduling_reschedule_booking(
  p_old_id uuid,
  p_new_start timestamptz,
  p_new_end timestamptz,
  p_new_token text,
  p_by text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.scheduling_bookings%rowtype;
  v_new_id uuid;
begin
  if p_by not in ('invitee','host') then
    raise exception 'invalid_actor';
  end if;

  select * into v_old from public.scheduling_bookings where id = p_old_id for update;
  if v_old.id is null or v_old.status not in ('pending','confirmed') then
    raise exception 'booking_not_active';
  end if;

  update public.scheduling_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = p_by,
         cancellation_reason = 'Reprogrammé'
   where id = p_old_id;

  insert into public.scheduling_bookings (
    user_id, event_type_id, event_title, location_type, location_text,
    start_at, end_at, status, invitee_name, invitee_email, invitee_phone,
    invitee_notes, invitee_timezone, additional_guests, answers, manage_token,
    contact_id, entreprise_id, opportunite_id, call_id, source,
    rescheduled_from_id, confirmed_at
  ) values (
    v_old.user_id, v_old.event_type_id, v_old.event_title, v_old.location_type,
    v_old.location_text, p_new_start, p_new_end, v_old.status, v_old.invitee_name,
    v_old.invitee_email, v_old.invitee_phone, v_old.invitee_notes,
    v_old.invitee_timezone, v_old.additional_guests, v_old.answers, p_new_token,
    v_old.contact_id, v_old.entreprise_id, v_old.opportunite_id, v_old.call_id,
    v_old.source, v_old.id, v_old.confirmed_at
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function
  public.scheduling_reschedule_booking(uuid, timestamptz, timestamptz, text, text)
  from anon, authenticated;

-- 8) Triggers updated_at (réutilise public.set_updated_at) --------------------
do $$
declare t text;
begin
  foreach t in array array[
    'scheduling_pages','scheduling_schedules','scheduling_date_overrides',
    'scheduling_event_types','scheduling_bookings','scheduling_booking_reminders',
    'scheduling_calendar_connections'
  ] loop
    execute format('drop trigger if exists trg_%1$s_set_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_set_updated_at before update on public.%1$s '
      'for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- 9) RLS ----------------------------------------------------------------------
alter table public.scheduling_pages                enable row level security;
alter table public.scheduling_schedules            enable row level security;
alter table public.scheduling_schedule_rules       enable row level security;
alter table public.scheduling_date_overrides       enable row level security;
alter table public.scheduling_event_types          enable row level security;
alter table public.scheduling_bookings             enable row level security;
alter table public.scheduling_booking_reminders    enable row level security;
alter table public.scheduling_calendar_connections enable row level security;

-- Tables « possédées » directement (user_id) : admin tout, agent ses lignes.
do $$
declare t text;
begin
  foreach t in array array[
    'scheduling_pages','scheduling_schedules','scheduling_event_types','scheduling_bookings'
  ] loop
    execute format('drop policy if exists "admin all %1$s" on public.%1$s;', t);
    execute format(
      'create policy "admin all %1$s" on public.%1$s '
      'for all using (public.is_admin()) with check (public.is_admin());', t);
    execute format('drop policy if exists "freelance own %1$s" on public.%1$s;', t);
    execute format(
      'create policy "freelance own %1$s" on public.%1$s '
      'for all using (public.is_freelance() and user_id = (select auth.uid())) '
      'with check (public.is_freelance() and user_id = (select auth.uid()));', t);
  end loop;
end $$;

-- Tables filles d'un planning : propriété via scheduling_schedules.user_id.
do $$
declare t text;
begin
  foreach t in array array['scheduling_schedule_rules','scheduling_date_overrides'] loop
    execute format('drop policy if exists "admin all %1$s" on public.%1$s;', t);
    execute format(
      'create policy "admin all %1$s" on public.%1$s '
      'for all using (public.is_admin()) with check (public.is_admin());', t);
    execute format('drop policy if exists "freelance own %1$s" on public.%1$s;', t);
    execute format(
      'create policy "freelance own %1$s" on public.%1$s for all using ('
      '  public.is_freelance() and exists ('
      '    select 1 from public.scheduling_schedules s '
      '    where s.id = %1$s.schedule_id and s.user_id = (select auth.uid()))'
      ') with check ('
      '  public.is_freelance() and exists ('
      '    select 1 from public.scheduling_schedules s '
      '    where s.id = %1$s.schedule_id and s.user_id = (select auth.uid()))'
      ');', t);
  end loop;
end $$;

-- Rappels : lecture par le propriétaire du booking ; écriture via service-role.
drop policy if exists "admin all scheduling_booking_reminders" on public.scheduling_booking_reminders;
create policy "admin all scheduling_booking_reminders" on public.scheduling_booking_reminders
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "freelance read own scheduling_booking_reminders" on public.scheduling_booking_reminders;
create policy "freelance read own scheduling_booking_reminders" on public.scheduling_booking_reminders
  for select using (
    public.is_freelance() and exists (
      select 1 from public.scheduling_bookings b
      where b.id = scheduling_booking_reminders.booking_id
        and b.user_id = (select auth.uid())));

-- Connexions d'agenda : tokens OAuth → AUCUNE policy, accès service-role
-- uniquement (les métadonnées passent par /api/scheduling/connections).

-- 10) Realtime : rafraîchir le dashboard hôte quand une résa arrive -----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'scheduling_bookings'
  ) then
    alter publication supabase_realtime add table public.scheduling_bookings;
  end if;
end $$;

commit;

-- 11) pg_cron : tick des rappels ----------------------------------------------
-- Enregistré séparément (hors transaction) comme process-scheduled-actions.
-- Le placeholder <PG_CRON_SECRET> DOIT être remplacé par la valeur passée à
-- l'app Next.js — la route src/app/api/cron/scheduling-tick/route.ts accepte
-- la requête quand le header `x-pg-cron-secret` correspond. Ne jamais
-- committer le vrai secret ici.
--
-- SELECT cron.schedule(
--   'scheduling-reminders-tick',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url        := 'https://crm-vercel.vercel.app/api/cron/scheduling-tick',
--     headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
--     body       := '{}'::jsonb,
--     timeout_milliseconds := 30000
--   ) AS request_id;
--   $$
-- );
