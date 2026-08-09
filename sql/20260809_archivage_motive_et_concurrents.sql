-- Archivage motivé des entreprises / opportunités + registre des concurrents.
--
-- POURQUOI
--
-- Une piste morte restait dans le pipeline pour toujours. Le seul moyen de la
-- faire disparaître du board Marketing & Web était « Masquer la ligne » — un
-- `Set` en mémoire, perdu au rechargement. Rien n'était persisté, rien n'était
-- motivé, et le motif le plus fréquent — le prospect a refait son site avec un
-- concurrent — finissait au mieux en texte libre dans le champ « Motif » du
-- pipeline commercial, donc inexploitable.
--
-- Ce que cette migration met en place :
--   1. `concurrents` — le registre, dédupliqué par domaine. Chaque fois qu'on
--      archive une fiche parce qu'un concurrent a pris le chantier, on pointe
--      dessus. La page /concurrents les classe ensuite par nombre de prospects
--      pris : de la matière à démarcher (sous-traitance, partenariat).
--   2. Cinq colonnes d'archivage sur `entreprises` ET `opportunites` : quand,
--      par qui, pourquoi, note libre, et le concurrent éventuel.
--
-- Pourquoi des colonnes plutôt qu'une table `archives` : les quatre boards
-- partent tous d'un `select` sur `opportunites` ou `entreprises` et doivent
-- exclure les archivés. Une colonne se filtre avec un `is null` ; une table
-- imposerait une jointure ou un `not in` à chaque requête.
--
-- Écritures : uniquement par les routes API en service role, qui revérifient la
-- propriété pour un agent freelance — même principe que
-- `agent_qualification_decisions`.
--
-- Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Le registre des concurrents
-- ---------------------------------------------------------------------------
create table if not exists public.concurrents (
  id         uuid primary key default gen_random_uuid(),
  -- Clé de déduplication : le hostname sans `www.`, en minuscules, tel que le
  -- produit `canonicalizeDomain` (src/lib/url-canonical.ts). `sub.agence.fr` et
  -- `agence.fr` restent donc deux entrées distinctes : regrouper par domaine
  -- enregistrable demanderait une public-suffix list, hors sujet ici.
  domaine    text not null unique,
  nom        text,        -- libellé lisible, saisi à la main ou dérivé du domaine
  site_url   text,        -- l'URL canonicalisée telle qu'elle a été saisie
  statut     text not null default 'a_qualifier'
             check (statut in ('a_qualifier','a_demarcher','contacte','partenaire','ecarte')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.user_profiles(id) on delete set null
);

create index if not exists idx_concurrents_statut
  on public.concurrents(statut, created_at desc);

drop trigger if exists concurrents_updated on public.concurrents;
create trigger concurrents_updated before update on public.concurrents
  for each row execute function public.tg_au_updated_at();

alter table public.concurrents enable row level security;

-- Admin : tout. Agent freelance : lecture seule — il doit pouvoir relire le
-- concurrent qu'il vient de faire créer par la route d'archivage.
drop policy if exists "admin all concurrents"      on public.concurrents;
drop policy if exists "freelance read concurrents" on public.concurrents;
create policy "admin all concurrents" on public.concurrents
  for all using (public.is_admin()) with check (public.is_admin());
create policy "freelance read concurrents" on public.concurrents
  for select using (public.is_freelance());

-- ---------------------------------------------------------------------------
-- 2. Les colonnes d'archivage
-- ---------------------------------------------------------------------------
alter table public.entreprises
  add column if not exists archived_at           timestamptz,
  add column if not exists archived_by           uuid references public.user_profiles(id) on delete set null,
  add column if not exists archive_reason        text,
  add column if not exists archive_note          text,
  add column if not exists archive_concurrent_id uuid references public.concurrents(id) on delete set null;

alter table public.opportunites
  add column if not exists archived_at           timestamptz,
  add column if not exists archived_by           uuid references public.user_profiles(id) on delete set null,
  add column if not exists archive_reason        text,
  add column if not exists archive_note          text,
  add column if not exists archive_concurrent_id uuid references public.concurrents(id) on delete set null;

-- Le vocabulaire des motifs. Cette liste doit rester identique à
-- `ARCHIVE_REASONS` dans src/lib/archive/reasons.ts — un test lit ce fichier et
-- compare les deux (src/lib/archive/__tests__/reasons.test.ts).
--
-- `drop` puis `add` plutôt que `add … if not exists` (qui n'existe pas pour les
-- contraintes) : la migration reste rejouable, et faire évoluer la liste se
-- résume à rejouer le fichier.
alter table public.entreprises drop constraint if exists entreprises_archive_reason_valide;
alter table public.entreprises add constraint entreprises_archive_reason_valide
  check (archive_reason is null or archive_reason in (
    'refait_par_concurrent','refait_en_interne','site_deja_bon','pas_de_budget',
    'pas_interesse','injoignable','ferme','hors_cible','doublon','deja_client','autre'
  ));

alter table public.opportunites drop constraint if exists opportunites_archive_reason_valide;
alter table public.opportunites add constraint opportunites_archive_reason_valide
  check (archive_reason is null or archive_reason in (
    'refait_par_concurrent','refait_en_interne','site_deja_bon','pas_de_budget',
    'pas_interesse','injoignable','ferme','hors_cible','doublon','deja_client','autre'
  ));

-- « Refait par un concurrent » sans dire lequel n'a aucune valeur : c'est le
-- seul motif qui alimente le registre. `is distinct from` (et non `<>`) est
-- volontaire — il laisse passer les fiches non archivées, où le motif est null.
alter table public.entreprises drop constraint if exists entreprises_archive_concurrent_requis;
alter table public.entreprises add constraint entreprises_archive_concurrent_requis
  check (archive_reason is distinct from 'refait_par_concurrent' or archive_concurrent_id is not null);

alter table public.opportunites drop constraint if exists opportunites_archive_concurrent_requis;
alter table public.opportunites add constraint opportunites_archive_concurrent_requis
  check (archive_reason is distinct from 'refait_par_concurrent' or archive_concurrent_id is not null);

-- Chemin chaud : tous les boards filtrent « non archivé ». Index partiels, donc
-- petits, et qui restent utiles même quand la majorité des fiches est active.
create index if not exists idx_entreprises_actives
  on public.entreprises(id) where archived_at is null;
create index if not exists idx_opportunites_actives
  on public.opportunites(id) where archived_at is null;

-- Chemin de la page /concurrents : compter les prises par concurrent.
create index if not exists idx_entreprises_archive_concurrent
  on public.entreprises(archive_concurrent_id) where archive_concurrent_id is not null;
create index if not exists idx_opportunites_archive_concurrent
  on public.opportunites(archive_concurrent_id) where archive_concurrent_id is not null;

commit;
