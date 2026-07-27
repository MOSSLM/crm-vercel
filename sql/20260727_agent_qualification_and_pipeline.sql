-- Qualification et marketing pipeline délégués aux agents freelance.
--
-- Contexte : jusqu'ici un agent ne travaillait que des entreprises DÉJÀ
-- qualifiées, attribuées une par une par l'admin. Toute la qualification et
-- tout le marketing pipeline restaient manuels côté admin.
--
-- Ce que cette migration met en place :
--   1. `agent_settings`  — capacités accordées agent par agent (qualification,
--      marketing pipeline) + plafond de dépense d'enrichissement. Défaut =
--      refus : l'absence de ligne vaut « aucune capacité ».
--   2. `agent_qualification_decisions` — le pré-tri de l'agent. Qualifier ou
--      masquer côté agent N'ÉCRIT PAS sur `entreprises` : ça enregistre une
--      décision « pending » que l'admin valide ou corrige ensuite. Le CRM admin
--      est donc strictement inchangé tant qu'une décision n'est pas validée.
--   3. `agent_activity_events` — journal des actions agent (décisions de
--      qualification + étapes du marketing pipeline), pour la vue admin.
--   4. `agent_usage_events` + `enrichment_llm_settings.cost_per_run_cents` —
--      comptabilisation de la dépense d'enrichissement par agent.
--
-- Pourquoi des tables dédiées plutôt que des colonnes existantes :
--   * pas de colonnes sur `user_profiles` : elle est lue par AuthContext à
--     chaque session et porte des policies sensibles (récursion déjà corrigée
--     dans 20260529_fix_rls_recursion.sql) — on ne l'élargit pas.
--   * pas de réutilisation d'`activity_log` : son enum d'activité
--     (appel/email/sms/rdv/…) ne couvre ni la qualification ni les étapes du
--     pipeline, elle est couplée aux KPI, et elle est encore sous la policy
--     « staff only » (cf. la note finale de 20260603_agent_portal_ownership.sql).
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Capacités + budget par agent
-- ---------------------------------------------------------------------------
create table if not exists public.agent_settings (
  agent_id                   uuid primary key
                             references public.user_profiles(id) on delete cascade,
  can_qualify                boolean not null default false,
  can_use_marketing_pipeline boolean not null default false,
  -- null = pas de plafond. Exprimé en centimes pour éviter le flottant.
  enrichment_budget_cents    integer,
  budget_period              text not null default 'month'
                             check (budget_period in ('month','total')),
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references public.user_profiles(id) on delete set null
);

alter table public.agent_settings enable row level security;

drop policy if exists "admin all agent_settings"      on public.agent_settings;
drop policy if exists "agent read own agent_settings" on public.agent_settings;

create policy "admin all agent_settings" on public.agent_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Le portail agent lit ses propres capacités pour masquer les entrées de nav.
create policy "agent read own agent_settings" on public.agent_settings
  for select using (agent_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Décisions de qualification des agents (pré-tri)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_qualification_decisions (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,
  agent_id      uuid   not null references public.user_profiles(id) on delete cascade,
  -- 'qualify' = l'agent propose de qualifier, 'skip' = l'agent a masqué/écarté.
  decision      text   not null check (decision in ('qualify','skip')),
  note          text,
  created_at    timestamptz not null default now(),
  review_status text not null default 'pending'
                check (review_status in ('pending','confirmed','overridden')),
  -- Ce que l'admin a réellement fait au moment de la revue.
  review_action text check (review_action in ('qualify','blacklist','hide','requeue','delete')),
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.user_profiles(id) on delete set null
);

-- Une seule décision en attente par entreprise, tous agents confondus : le pool
-- de qualification est global, donc une entreprise traitée par l'agent A doit
-- disparaître de la file de tous les autres. C'est aussi ce qui empêche deux
-- agents de proposer des décisions contradictoires sur la même entreprise.
create unique index if not exists uniq_pending_agent_decision
  on public.agent_qualification_decisions(entreprise_id)
  where review_status = 'pending';

create index if not exists idx_aqd_agent
  on public.agent_qualification_decisions(agent_id, created_at desc);
create index if not exists idx_aqd_pending
  on public.agent_qualification_decisions(review_status)
  where review_status = 'pending';
create index if not exists idx_aqd_entreprise
  on public.agent_qualification_decisions(entreprise_id);

alter table public.agent_qualification_decisions enable row level security;

drop policy if exists "admin all agent decisions"      on public.agent_qualification_decisions;
drop policy if exists "agent read own agent decisions" on public.agent_qualification_decisions;

create policy "admin all agent decisions" on public.agent_qualification_decisions
  for all using (public.is_admin()) with check (public.is_admin());

-- Lecture seule côté agent : les écritures passent par l'API (service role),
-- qui vérifie la capacité avant d'insérer.
create policy "agent read own agent decisions" on public.agent_qualification_decisions
  for select using (agent_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Journal des actions agent
-- ---------------------------------------------------------------------------
create table if not exists public.agent_activity_events (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.user_profiles(id) on delete cascade,
  entreprise_id bigint references public.entreprises(id) on delete set null,
  -- qualify | skip | enrich | validate_enrich | create_site | validate_site |
  -- create_audit | validate_audit
  action        text not null,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aae_agent_created
  on public.agent_activity_events(agent_id, created_at desc);
create index if not exists idx_aae_entreprise
  on public.agent_activity_events(entreprise_id);

alter table public.agent_activity_events enable row level security;

drop policy if exists "admin all agent activity"      on public.agent_activity_events;
drop policy if exists "agent read own agent activity" on public.agent_activity_events;

create policy "admin all agent activity" on public.agent_activity_events
  for all using (public.is_admin()) with check (public.is_admin());

create policy "agent read own agent activity" on public.agent_activity_events
  for select using (agent_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Consommation LLM par agent
-- ---------------------------------------------------------------------------
-- Sur les 4 étapes du marketing pipeline, seul l'enrichissement coûte : la
-- création de site démo est un clone SQL (cloneTemplateSite) et l'audit un
-- insert de contenu templaté. On ne comptabilise donc que l'enrichissement,
-- mais `kind` laisse la porte ouverte.
create table if not exists public.agent_usage_events (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.user_profiles(id) on delete cascade,
  entreprise_id bigint references public.entreprises(id) on delete set null,
  kind          text not null default 'enrichment',
  provider      text,
  model         text,
  -- Coût estimé, issu du forfait par run configuré dans les Paramètres.
  cost_cents    integer not null default 0,
  -- Renseignés seulement si l'edge function est un jour modifiée pour
  -- remonter `usage` (elle le lit déjà mais ne le persiste pas).
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

create index if not exists idx_aue_agent_created
  on public.agent_usage_events(agent_id, created_at desc);

alter table public.agent_usage_events enable row level security;

drop policy if exists "admin all agent usage"      on public.agent_usage_events;
drop policy if exists "agent read own agent usage" on public.agent_usage_events;

create policy "admin all agent usage" on public.agent_usage_events
  for all using (public.is_admin()) with check (public.is_admin());

create policy "agent read own agent usage" on public.agent_usage_events
  for select using (agent_id = (select auth.uid()));

-- Prix forfaitaire d'un run d'enrichissement, éditable depuis les Paramètres.
-- 0 = gratuit (aucun budget ne sera jamais dépassé).
alter table public.enrichment_llm_settings
  add column if not exists cost_per_run_cents integer not null default 0;

commit;
