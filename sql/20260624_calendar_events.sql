-- CRM: calendrier type Google Agenda — blocs de travail récurrents + code couleur
-- Compatible Supabase / PostgreSQL
-- À exécuter manuellement dans l'éditeur SQL Supabase.

begin;

-- 1) Catégories réutilisables (légende + code couleur)
create table if not exists public.crm_calendar_categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  color text not null default '#2A6FDB',
  position integer not null default 100,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_calendar_categories_nom_not_empty check (length(trim(nom)) > 0),
  constraint crm_calendar_categories_color_hex_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists crm_calendar_categories_position_idx
  on public.crm_calendar_categories (position, created_at);

-- 2) Blocs de travail / évènements (avec récurrence)
create table if not exists public.crm_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category_id uuid references public.crm_calendar_categories(id) on delete set null,
  color text,                              -- override optionnel ; sinon couleur de la catégorie
  all_day boolean not null default false,
  start_at timestamptz not null,           -- 1re occurrence : date + heure de début
  end_at   timestamptz not null,           -- 1re occurrence : fin (définit la durée)
  -- récurrence
  recurrence_freq text not null default 'none',       -- 'none' | 'daily' | 'weekly' | 'monthly'
  recurrence_interval integer not null default 1,     -- toutes les N (jours/semaines/mois)
  recurrence_weekdays smallint[],                     -- hebdo : ISO 1=lun..7=dim
  recurrence_until date,                              -- dernière date incluse ; null = sans fin
  recurrence_exceptions date[] not null default '{}', -- occurrences supprimées une à une
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_calendar_events_title_not_empty check (length(trim(title)) > 0),
  constraint crm_calendar_events_color_hex_check check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint crm_calendar_events_freq_check check (recurrence_freq in ('none','daily','weekly','monthly')),
  constraint crm_calendar_events_interval_check check (recurrence_interval >= 1),
  constraint crm_calendar_events_time_order check (end_at >= start_at)
);

create index if not exists crm_calendar_events_start_idx on public.crm_calendar_events (start_at);
create index if not exists crm_calendar_events_category_idx on public.crm_calendar_events (category_id);

-- 3) Triggers updated_at (réutilise la fonction existante public.set_updated_at)
drop trigger if exists trg_crm_calendar_events_set_updated_at on public.crm_calendar_events;
create trigger trg_crm_calendar_events_set_updated_at
  before update on public.crm_calendar_events
  for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_calendar_categories_set_updated_at on public.crm_calendar_categories;
create trigger trg_crm_calendar_categories_set_updated_at
  before update on public.crm_calendar_categories
  for each row execute function public.set_updated_at();

-- 4) (Optionnel) code couleur pour les tâches autonomes affichées en overlay du calendrier
alter table if exists public.crm_tasks
  add column if not exists color text;
alter table if exists public.crm_tasks
  drop constraint if exists crm_tasks_color_hex_check;
alter table if exists public.crm_tasks
  add constraint crm_tasks_color_hex_check check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

commit;
