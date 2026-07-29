-- Notes / tickets du marketing pipeline (agent → admin).
--
-- Contexte : un agent qui produit un site démo ou un audit tombe sur des cas
-- qu'il ne veut pas — ou ne peut pas — corriger lui-même (données fausses,
-- section cassée, doute sur un chiffre). Jusqu'ici il n'avait aucun canal :
-- soit il corrigeait à l'aveugle, soit la ligne restait bloquée sans que
-- l'admin le sache.
--
-- Ce que cette migration met en place :
--   1. `marketing_pipeline_notes`          — le ticket : une opportunité, un
--      sujet (enrichissement / site / audit / autre), une gravité, un statut
--      (open → in_progress → resolved).
--   2. `marketing_pipeline_note_messages`  — le fil de discussion du ticket,
--      agent et admin dans la même table, ordonné par `created_at`.
--
-- Le premier message est inséré en même temps que le ticket : le fil contient
-- donc toujours au moins la description d'origine, et l'affichage n'a jamais à
-- traiter le corps du ticket et ses réponses différemment.
--
-- RLS : admin tout ; l'agent lit ses propres tickets (ceux qu'il a ouverts ou
-- ceux portant sur une entreprise qui lui est attribuée). Les écritures passent
-- par les routes API (service role), qui revérifient la propriété — même
-- principe que `agent_qualification_decisions`.
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Le ticket
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_pipeline_notes (
  id             uuid primary key default gen_random_uuid(),
  opportunite_id uuid   not null references public.opportunites(id) on delete cascade,
  entreprise_id  bigint references public.entreprises(id) on delete set null,
  -- Étape concernée : c'est ce qui permet d'afficher le badge sur la bonne
  -- carte du board (« Site », « Audit », …).
  subject        text   not null default 'site'
                 check (subject in ('enrichment','site','audit','other')),
  severity       text   not null default 'probleme'
                 check (severity in ('info','probleme','bloquant')),
  title          text   not null,
  status         text   not null default 'open'
                 check (status in ('open','in_progress','resolved')),
  created_by     uuid   references public.user_profiles(id) on delete set null,
  created_by_role text  not null default 'agent'
                 check (created_by_role in ('agent','admin')),
  resolved_at    timestamptz,
  resolved_by    uuid   references public.user_profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_mpn_opportunite
  on public.marketing_pipeline_notes(opportunite_id);
create index if not exists idx_mpn_entreprise
  on public.marketing_pipeline_notes(entreprise_id);
create index if not exists idx_mpn_open
  on public.marketing_pipeline_notes(status, updated_at desc)
  where status <> 'resolved';
create index if not exists idx_mpn_created_by
  on public.marketing_pipeline_notes(created_by, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Le fil de discussion
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_pipeline_note_messages (
  id          uuid primary key default gen_random_uuid(),
  note_id     uuid not null references public.marketing_pipeline_notes(id) on delete cascade,
  author_id   uuid references public.user_profiles(id) on delete set null,
  author_role text not null default 'agent' check (author_role in ('agent','admin')),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mpnm_note
  on public.marketing_pipeline_note_messages(note_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.marketing_pipeline_notes         enable row level security;
alter table public.marketing_pipeline_note_messages enable row level security;

drop policy if exists "admin all mp notes"      on public.marketing_pipeline_notes;
drop policy if exists "agent read own mp notes" on public.marketing_pipeline_notes;

create policy "admin all mp notes" on public.marketing_pipeline_notes
  for all using (public.is_admin()) with check (public.is_admin());

-- Ses tickets : ceux qu'il a ouverts, ou ceux d'une entreprise qui lui est
-- attribuée (un ticket ouvert par l'admin sur son prospect doit lui parvenir).
create policy "agent read own mp notes" on public.marketing_pipeline_notes
  for select using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.entreprises e
      where e.id = marketing_pipeline_notes.entreprise_id
        and e.owner_id = (select auth.uid())
    )
  );

drop policy if exists "admin all mp note messages"      on public.marketing_pipeline_note_messages;
drop policy if exists "agent read own mp note messages" on public.marketing_pipeline_note_messages;

create policy "admin all mp note messages" on public.marketing_pipeline_note_messages
  for all using (public.is_admin()) with check (public.is_admin());

create policy "agent read own mp note messages" on public.marketing_pipeline_note_messages
  for select using (
    exists (
      select 1 from public.marketing_pipeline_notes n
      left join public.entreprises e on e.id = n.entreprise_id
      where n.id = marketing_pipeline_note_messages.note_id
        and (n.created_by = (select auth.uid()) or e.owner_id = (select auth.uid()))
    )
  );

commit;
