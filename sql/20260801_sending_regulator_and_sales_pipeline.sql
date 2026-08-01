-- ═══════════════════════════════════════════════════════════════════════════
-- Régulateur d'envoi + pipeline commercial
--
-- Deux briques qui n'existaient pas :
--
--  1. LE RÉGULATEUR — jusqu'ici une séquence envoyait « dès que next_run_at est
--     passé », avec un simple espacement de 2 à 7 min calculé au vol dans le
--     ticker. On veut désormais UNE SEULE FILE pour tout le CRM (toutes
--     séquences, toutes entreprises confondues), avec un écart aléatoire
--     réglable entre deux emails, des plages horaires par séquence, un plafond
--     quotidien global, un espacement minimum entre deux contacts d'une même
--     entreprise, et une pause globale.
--
--  2. LE PIPELINE COMMERCIAL — une ligne par opportunité, huit colonnes
--     (séquence → email → whatsapp → appel → rdv → proposition → négociation →
--     signature). L'état de la ligne (étapes franchies, étapes sautées, perdu /
--     nurturing / blacklist) n'est pas déductible des seules tables existantes :
--     il lui faut sa propre table, avec un pointeur d'étape MONOTONE (`passed`)
--     pour qu'une séquence qui repasse par un email après un WhatsApp ne
--     re-verrouille pas la colonne WhatsApp.
--
-- Idempotent : rejouable sans effet de bord.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Réglages du régulateur (une seule ligne, id = 'global') ─────────────
-- Les surcharges par séquence (plages d'envoi, priorité, plafond) vivent dans
-- `automations.settings` — un jsonb déjà présent, déjà lu par l'éditeur de
-- séquence. Pas de table de jointure pour trois champs.
create table if not exists public.regulator_settings (
  id text primary key default 'global',

  -- Débit ------------------------------------------------------------------
  -- Écart aléatoire tiré entre deux emails, en minutes. Presets côté UI :
  -- Prudent 18–40 · Normal 7–14 · Soutenu 3–7.
  gap_min_minutes int not null default 7 check (gap_min_minutes >= 1),
  gap_max_minutes int not null default 14 check (gap_max_minutes >= 1),

  -- Plafond quotidien global, toutes séquences confondues.
  daily_cap int not null default 120 check (daily_cap >= 0),

  -- Espacement minimum entre deux emails partant vers la MÊME entreprise
  -- (trois personnes du même garage ne reçoivent pas tout d'un coup).
  company_gap_minutes int not null default 45 check (company_gap_minutes >= 0),

  -- Interrupteur général : rien ne part, la file est gelée mais rien n'est perdu.
  paused boolean not null default false,

  -- Garde-fous -------------------------------------------------------------
  -- La file regarde l'historique de TOUTES les séquences, pas seulement la sienne.
  count_all_sequences boolean not null default true,
  -- Un contact inscrit dans deux séquences ne reçoit qu'un email par jour.
  one_per_day_per_contact boolean not null default true,
  -- Le contact quitte ses séquences dès qu'il répond.
  exit_on_reply boolean not null default true,
  -- Envoyer uniquement du lundi au vendredi.
  business_days_only boolean not null default true,

  -- Plages par défaut, appliquées aux séquences qui n'en définissent pas.
  -- Format : [[début, fin], …] en minutes depuis minuit, sans chevauchement.
  default_windows jsonb not null default '[[510,690],[840,1050]]'::jsonb,
  timezone text not null default 'Europe/Paris',

  -- Attribution des tâches manuelles (WhatsApp / LinkedIn / appel) ----------
  -- 'pref'   : agent propriétaire de préférence, l'admin prend le relais si sa
  --            file est pleine ;
  -- 'strict' : tout reste chez l'agent propriétaire, la tâche l'attend ;
  -- 'admin'  : tout à l'admin, qui redistribue à la main.
  task_routing_mode text not null default 'pref'
    check (task_routing_mode in ('pref', 'strict', 'admin')),
  task_max_per_agent int not null default 8 check (task_max_per_agent >= 1),
  -- Admin destinataire par défaut. NULL → le premier admin trouvé.
  admin_user_id uuid references public.user_profiles(id) on delete set null,

  updated_at timestamptz not null default now(),
  constraint regulator_gap_ordered check (gap_max_minutes >= gap_min_minutes)
);

insert into public.regulator_settings (id) values ('global')
on conflict (id) do nothing;

drop trigger if exists regulator_settings_updated on public.regulator_settings;
create trigger regulator_settings_updated before update on public.regulator_settings
  for each row execute function public.tg_au_updated_at();

alter table public.regulator_settings enable row level security;
drop policy if exists "regulator read authenticated" on public.regulator_settings;
drop policy if exists "regulator write admin" on public.regulator_settings;
create policy "regulator read authenticated" on public.regulator_settings
  for select using (auth.role() = 'authenticated');
create policy "regulator write admin" on public.regulator_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. File d'envoi : ce que le régulateur décide, inscription par inscription ──
--
-- `next_run_at` garde son sens : « pas avant cette date » (le J+n de l'étape).
-- `send_at` est la décision du régulateur : l'heure exacte retenue pour cet
-- email, plages et écarts compris. `hold_reason` dit POURQUOI ça attend — c'est
-- ce qui rend la file lisible plutôt que magique.
alter table public.sequence_enrollments
  add column if not exists send_at timestamptz,
  add column if not exists hold_reason text,
  add column if not exists last_email_at timestamptz;

create index if not exists sequence_enrollments_send_at_idx
  on public.sequence_enrollments(send_at)
  where status = 'active';

comment on column public.sequence_enrollments.send_at is
  'Heure retenue par le régulateur pour le prochain email (null = pas un email ou pas planifié).';
comment on column public.sequence_enrollments.hold_reason is
  'Motif du report : out_of_window | next_day | company_gap | daily_cap | sequence_paused | global_pause | one_per_day.';

-- ── 3. Traçabilité du routage des tâches manuelles ────────────────────────
alter table public.prospection_tasks
  add column if not exists routing_reason text;

create index if not exists prospection_tasks_assignee_idx
  on public.prospection_tasks(assignee_id, status, due_at);

comment on column public.prospection_tasks.routing_reason is
  'Pourquoi la tâche a atterri chez cette personne (propriétaire, file pleine → admin, aucun propriétaire → admin…).';

-- Indisponibilité déclarée d'un agent : en mode « propriétaire de préférence »,
-- ses tâches basculent chez l'admin plutôt que de dormir dans sa file.
alter table public.agent_settings
  add column if not exists unavailable_until date;

-- ── 3 bis. Rattacher un email envoyé à sa séquence ────────────────────────
-- `email_logs.type = 'sequence'` disait « c'est une séquence » sans dire
-- laquelle : impossible de compter le plafond d'UNE séquence, ni d'afficher sa
-- part de la file. Deux colonnes, et les stats deviennent lisibles.
alter table public.email_logs
  add column if not exists automation_id uuid references public.automations(id) on delete set null,
  add column if not exists enrollment_id uuid references public.sequence_enrollments(id) on delete set null;

create index if not exists email_logs_automation_idx
  on public.email_logs(automation_id, sent_at desc);

-- ── 4. État d'une ligne du pipeline commercial ────────────────────────────
--
-- Une ligne = une opportunité. `reached` est l'étape courante, `passed` la liste
-- des étapes franchies (pointeur MONOTONE : une séquence qui revient à l'email
-- après un WhatsApp ne re-verrouille pas WhatsApp), `skipped` celles qu'on a
-- sautées et pourquoi — on garde la trace de ce qui n'a pas été fait.
create table if not exists public.sales_pipeline_state (
  opportunite_id uuid primary key references public.opportunites(id) on delete cascade,

  -- seq | email | wa | call | rdv | propo | nego | signe
  reached text not null default 'seq',
  passed text[] not null default '{}',
  skipped text[] not null default '{}',
  skip_reason text,

  -- progress | nurt | lost | black | won
  state text not null default 'progress'
    check (state in ('progress', 'nurt', 'lost', 'black', 'won')),
  state_reason text,
  -- Date de relance quand l'état est « nurturing ».
  nurture_at date,

  -- Le prospect a montré un signe de vie (réponse email, rappel, RDV pris seul).
  -- Dès que c'est vrai, les cellules WhatsApp et Appel basculent en « inutile —
  -- passer au RDV » : on n'insiste pas sur quelqu'un qui a déjà réagi.
  replied boolean not null default false,

  -- Jalons commerciaux, saisis par le commercial (pas déductibles ailleurs).
  rdv_at timestamptz,
  propo_amount numeric,
  objection text,
  -- Dates d'entrée dans chaque étape : { "seq": "2026-07-24", … }
  stage_dates jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_pipeline_state_state_idx
  on public.sales_pipeline_state(state, reached);

drop trigger if exists sales_pipeline_state_updated on public.sales_pipeline_state;
create trigger sales_pipeline_state_updated before update on public.sales_pipeline_state
  for each row execute function public.tg_au_updated_at();

alter table public.sales_pipeline_state enable row level security;

-- Admin : tout. Agent freelance : seulement ses opportunités (même règle que
-- `opportunites`, cf. 20260603_agent_portal_ownership.sql).
drop policy if exists "admin all sales pipeline state" on public.sales_pipeline_state;
drop policy if exists "freelance own sales pipeline state" on public.sales_pipeline_state;
create policy "admin all sales pipeline state" on public.sales_pipeline_state
  for all using (public.is_admin()) with check (public.is_admin());
create policy "freelance own sales pipeline state" on public.sales_pipeline_state
  for select using (
    public.is_freelance()
    and exists (
      select 1 from public.opportunites o
      where o.id = sales_pipeline_state.opportunite_id
        and o.owner_id = (select auth.uid())
    )
  );

-- ── 5. Plages d'envoi par défaut sur les séquences existantes ─────────────
-- Une séquence sans plage enverrait 24 h/24 : on leur pose les créneaux par
-- défaut (08:30–11:30 et 14:00–17:30) sans écraser celles déjà réglées.
update public.automations
set settings = coalesce(settings, '{}'::jsonb)
  || jsonb_build_object(
       'sendWindows', coalesce(settings -> 'sendWindows', '[[510,690],[840,1050]]'::jsonb),
       'queuePriority', coalesce(settings -> 'queuePriority', to_jsonb(2)),
       'dailyCap', coalesce(settings -> 'dailyCap', 'null'::jsonb)
     )
where kind = 'sequence'
  and (settings -> 'sendWindows') is null;

commit;
