-- Comptes rendus de rendez-vous, rattachés à une entreprise.
--
-- Contexte : le formulaire qu'on remplit *pendant* le rendez-vous n'existait
-- nulle part. Les informations récoltées pendant un appel finissaient dans
-- `notes` (rattachées à une opportunité, donc absentes tant qu'aucune
-- opportunité n'existe) ou dans `call_notes` (rattachées à un appel réel du
-- standard, donc absentes quand le prospect appelle sur le portable). Résultat :
-- un prospect qui rappelle deux semaines plus tard repart de zéro.
--
-- Ce que cette table pose :
--   - L'ancrage est l'**entreprise**, pas l'opportunité ni l'appel. C'est la
--     seule entité qui existe toujours, y compris pour un prospect jamais
--     travaillé. Les autres liens (booking, opportunité, contact, appel) sont
--     tous facultatifs et se remplissent quand le contexte les fournit.
--   - Le questionnaire vient du **form builder** : `form_id` pointe sur la ligne
--     `forms` utilisée, et `reponses` porte les réponses `{ [idQuestion]: valeur }`.
--     Les questions sont donc éditables depuis `/forms` sans migration, et un
--     compte rendu ancien reste lisible même si le formulaire a changé depuis —
--     le rendu croise les clés stockées avec les questions actuelles et affiche
--     les orphelines telles quelles.
--   - `statut` distingue le brouillon (ouvert en plein appel, sauvegardé au fil
--     de l'eau) du compte rendu terminé. Un brouillon ne doit jamais bloquer :
--     tous les champs sauf l'entreprise et l'auteur sont nullables.
--
-- Un rendez-vous du module scheduling ne peut porter qu'un seul compte rendu —
-- d'où l'index unique partiel. À l'inverse une entreprise en accumule autant
-- que d'échanges : c'est l'historique qu'on relit avant de rappeler.
--
-- RLS : admin tout ; l'agent lit et écrit les siens, plus ceux des entreprises
-- qui lui sont attribuées. Les routes API passent par le service role et
-- revérifient la propriété, même principe que `marketing_pipeline_notes`.
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. La table
-- ---------------------------------------------------------------------------
create table if not exists public.rdv_comptes_rendus (
  id uuid primary key default gen_random_uuid(),

  -- Le seul lien obligatoire : l'entreprise dont on parle.
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,
  auteur_id uuid not null references public.user_profiles(id) on delete cascade,

  -- Le questionnaire utilisé. `set null` et pas `cascade` : supprimer un
  -- formulaire ne doit pas emporter l'historique commercial écrit avec.
  form_id uuid references public.forms(id) on delete set null,

  -- Liens facultatifs, remplis selon d'où part le compte rendu.
  booking_id uuid references public.scheduling_bookings(id) on delete set null,
  opportunite_id uuid references public.opportunites(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,

  -- Par quel canal l'échange a eu lieu.
  canal text not null default 'appel'
    check (canal in ('appel', 'rdv', 'visio', 'terrain', 'autre')),

  -- Un brouillon est ouvert pendant l'échange et sauvegardé au fil de l'eau.
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'termine')),

  -- Où on en est avec ce prospect à la fin de l'échange.
  issue text
    check (issue in ('interesse', 'a_relancer', 'reflexion', 'pas_interesse',
                     'injoignable', 'vendu')),

  titre text,
  -- Le formulaire structuré : { [idChamp]: valeur }.
  reponses jsonb not null default '{}'::jsonb,
  resume text,
  prochaine_etape text,
  date_prochaine_etape date,

  demarre_le timestamptz not null default now(),
  termine_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un rendez-vous planifié ne porte qu'un compte rendu ; les comptes rendus
-- hors rendez-vous (appel entrant) n'ont pas de booking et ne sont pas contraints.
create unique index if not exists rdv_comptes_rendus_booking_uniq
  on public.rdv_comptes_rendus (booking_id)
  where booking_id is not null;

-- L'accès dominant : l'historique d'une entreprise, du plus récent au plus ancien.
create index if not exists rdv_comptes_rendus_entreprise_idx
  on public.rdv_comptes_rendus (entreprise_id, demarre_le desc);

-- « Mes comptes rendus » et le badge des brouillons à finir.
create index if not exists rdv_comptes_rendus_auteur_idx
  on public.rdv_comptes_rendus (auteur_id, statut, demarre_le desc);

create index if not exists rdv_comptes_rendus_opportunite_idx
  on public.rdv_comptes_rendus (opportunite_id);

-- Les relances à sortir : ce qui a une échéance et n'est pas clos.
create index if not exists rdv_comptes_rendus_suivi_idx
  on public.rdv_comptes_rendus (date_prochaine_etape)
  where date_prochaine_etape is not null;

drop trigger if exists trg_rdv_comptes_rendus_updated_at on public.rdv_comptes_rendus;
create trigger trg_rdv_comptes_rendus_updated_at
  before update on public.rdv_comptes_rendus
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
alter table public.rdv_comptes_rendus enable row level security;

drop policy if exists "admin all rdv comptes rendus"  on public.rdv_comptes_rendus;
drop policy if exists "agent read own rdv comptes rendus"  on public.rdv_comptes_rendus;
drop policy if exists "agent write own rdv comptes rendus" on public.rdv_comptes_rendus;

create policy "admin all rdv comptes rendus" on public.rdv_comptes_rendus
  for all using (public.is_admin()) with check (public.is_admin());

-- Les siens, ou ceux d'une entreprise qui lui est attribuée : un agent qui
-- reprend un prospect doit lire ce que l'admin a noté avant lui.
create policy "agent read own rdv comptes rendus" on public.rdv_comptes_rendus
  for select using (
    auteur_id = (select auth.uid())
    or exists (
      select 1 from public.entreprises e
      where e.id = rdv_comptes_rendus.entreprise_id
        and e.owner_id = (select auth.uid())
    )
  );

-- Il n'édite que ce qu'il a écrit — relire le compte rendu d'un collègue, oui ;
-- le réécrire, non.
create policy "agent write own rdv comptes rendus" on public.rdv_comptes_rendus
  for update using (auteur_id = (select auth.uid()))
  with check (auteur_id = (select auth.uid()));

commit;
