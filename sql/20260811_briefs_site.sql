-- =====================================================================
-- Brief de reprise — `site_briefs`
-- =====================================================================
-- CE QUE ÇA REMPLACE. `sites.client_brief` : un champ de texte libre que
-- l'ACHETEUR devait remplir lui-même depuis son espace, avec ses photos.
-- Un artisan qui vient de payer n'a pas envie de faire ses devoirs, et
-- un brief vide bloque la production sans que personne le sache. La
-- collecte passe donc du client à l'agent, pendant l'appel de RDV.
--
-- POURQUOI UNE TABLE PLUTÔT QU'UNE COLONNE JSONB SUR `sites`.
-- `sites` est lue par `site-resolver` sur le chemin de rendu de TOUS les
-- sites publiés. Le brief s'écrit à chaque frappe (enregistrement
-- automatique pendant l'appel) : y mettre une écriture chaude serait le
-- même mauvais échange que pour le compteur de vues du rapport public.
-- Même discipline que `entreprises_rapport_public` — une table satellite,
-- possédée par l'API.
--
-- POURQUOI `reponses` EN JSONB ET PAS TRENTE COLONNES.
-- Le questionnaire va bouger : on ajoute une question après trois appels
-- ratés, on en retire une qui ne sert jamais. Le formulaire est décrit en
-- TypeScript (`src/lib/brief/formulaire.ts`) et cette table n'en connaît
-- rien — changer une question ne demande aucune migration. Ce qui mérite
-- une colonne, c'est ce qu'on interroge : l'avancement et le rattachement.
--
-- `notes` EST À PART DES RÉPONSES, volontairement. Ce sont deux gestes
-- différents pendant un appel : répondre à une question, et noter ce que
-- le client dit et qui n'entre dans aucune case. Le second est celui qu'on
-- relit avant de produire le site.
-- =====================================================================

begin;

create table if not exists public.site_briefs (
  site_id       uuid primary key references public.sites(id) on delete cascade,
  entreprise_id bigint references public.entreprises(id) on delete set null,
  -- `opportunites.id` est du TEXT dans ce schéma (cf. `audits.opportunite_id`).
  opportunite_id text,

  -- Les réponses, clé de champ → valeur. Le formulaire en est la seule
  -- description ; la base ne valide rien ici, à dessein.
  reponses  jsonb not null default '{}'::jsonb,
  -- Ce que le client dit et qui n'entre dans aucune case.
  notes     text,

  -- L'étape affichée à la réouverture : on reprend un appel là où on
  -- l'avait laissé plutôt qu'au début.
  etape     int not null default 0,
  statut    text not null default 'en_cours',

  termine_le timestamptz,
  cree_le    timestamptz not null default now(),
  cree_par   uuid,
  maj_le     timestamptz not null default now(),
  maj_par    uuid,

  constraint site_briefs_statut_check check (statut in ('en_cours', 'complet'))
);

comment on table public.site_briefs is
  'Brief de reprise d''un site vendu, rempli par l''agent pendant l''appel de RDV (pas par le client).';
comment on column public.site_briefs.reponses is
  'Réponses clé → valeur. Le questionnaire est décrit dans src/lib/brief/formulaire.ts, pas ici.';
comment on column public.site_briefs.notes is
  'Notes libres d''appel. Séparées des réponses : c''est le champ qu''on relit avant de produire.';

create index if not exists idx_site_briefs_entreprise
  on public.site_briefs (entreprise_id);
create index if not exists idx_site_briefs_statut
  on public.site_briefs (statut) where statut = 'en_cours';

-- `maj_le` tenu par la base : la route enregistre en continu et ne doit pas
-- avoir à y penser à chaque appel.
create or replace function public.site_briefs_touch()
returns trigger
language plpgsql
as $$
begin
  new.maj_le := now();
  return new;
end $$;

drop trigger if exists trg_site_briefs_touch on public.site_briefs;
create trigger trg_site_briefs_touch
  before update on public.site_briefs
  for each row execute function public.site_briefs_touch();

alter table public.site_briefs enable row level security;

-- `is_staff()` ET PAS `authenticated`, contrairement à la plupart des tables
-- du CRM. Un client du portail est lui aussi `authenticated` : la politique
-- large lui donnerait la lecture de TOUS les briefs, dont `reponses.
-- prix_convenu`, `reponses.acompte` et les notes d'appel — ce qu'on dit de lui
-- entre deux questions. Rien ici n'a à être lu depuis un navigateur client.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'site_briefs'
      and policyname = 'site_briefs_staff'
  ) then
    create policy site_briefs_staff on public.site_briefs
      for all using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

-- Politique large d'une version antérieure de ce fichier, si elle a été jouée.
drop policy if exists site_briefs_authenticated on public.site_briefs;

commit;

-- `sites.client_brief` n'est PAS supprimée : elle porte les briefs déjà
-- saisis par des clients. La carte de l'espace client ne l'écrit plus, et
-- le brief agent la reprend comme point de départ à la première ouverture.
