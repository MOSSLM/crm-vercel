-- =====================================================================
-- Le tirage de photos devient une donnée de l'ENTREPRISE
-- `entreprise_tirages_photos`
-- =====================================================================
-- CE QUI S'EST PASSÉ, ET QUI JUSTIFIE CETTE TABLE.
-- Le tirage de la bande « réalisations » ne vivait que dans
-- `site_section_instances.content.__overrides` — le JSON des pages du
-- site. Or deux chemins RECRÉENT ces lignes : la refonte depuis un
-- modèle (`rebuild-site-from-template`, DELETE puis INSERT) et le
-- clonage (`clone-template-site`). Le 12/08/2026 à 14h26 UTC, 34 sites
-- ont été refaits depuis « template CVC - Verdure » une heure et demie
-- après leur tirage : les 34 se sont retrouvés avec le JSON du gabarit,
-- octet pour octet. Photos hors métier, doublons de retour, et deux
-- images supprimées de la médiathèque entre-temps qui pointaient dans
-- le vide. Rien n'était récupérable : `pushBackup` ne couvre pas ce
-- chemin, et la graine du tirage n'était stockée nulle part.
--
-- Le tirage est donc sorti du JSON des pages. Les pages restent ce qui
-- s'AFFICHE ; cette table est ce qui FAIT FOI. Une page recréée est
-- repeuplée depuis ici (`appliquer-tirage.ts`), avant toute
-- republication — le retour en arrière n'a plus de prise.
--
-- POURQUOI UNE TABLE SATELLITE ET PAS UNE COLONNE SUR `entreprises`.
-- Même raison que `site_briefs` : `entreprises` est lue sur le chemin de
-- rendu de tous les sites publiés (`resolve-variables`), et l'on n'y
-- ajoute pas un jsonb qui grossit à chaque zone tirée. Ici la clé est
-- (entreprise, zone) : une ligne par bande, remplacée à chaque tirage.
--
-- POURQUOI PAS UNE CLÉ PAR SITE. Une entreprise peut voir son site
-- refait, changer de modèle, en avoir plusieurs : le tirage survit à
-- tout ça parce qu'il appartient à l'entreprise et à ses métiers, pas à
-- une maquette. C'est exactement ce qui manquait.
--
-- CE QUE `slots` CONTIENT — [{ ordre, url, alt, tag, masque }] :
--   ordre  : rang 1-based dans la bande (l'ordre des cartes à l'écran)
--   url    : l'URL publique de la photo, telle qu'elle sera servie
--   alt    : le texte alternatif retenu au tirage
--   tag    : le métier avec lequel l'emplacement a été tiré (clé
--            canonique), pour qu'un re-tirage d'une seule carte reste
--            sur son métier
--   masque : la carte a été retirée faute de stock — le tirage préfère
--            une bande de cinq à une bande de six avec un doublon
-- Le tableau est stocké TEL QUEL et appliqué TEL QUEL : plus de
-- résolution au rendu qui pourrait retomber sur une autre photo.
-- =====================================================================

begin;

create table if not exists public.entreprise_tirages_photos (
  entreprise_id bigint  not null references public.entreprises(id) on delete cascade,
  -- `AUTO_IMAGE_ZONES[].id` côté TypeScript ('realisations' aujourd'hui).
  -- Du texte libre à dessein : ajouter une zone ne demande pas de migration.
  zone_id       text    not null,

  slots         jsonb   not null default '[]'::jsonb,

  -- La graine, pour rejouer un tirage à l'identique en cas de doute.
  seed          bigint,
  -- Qui a lancé le tirage. `set null` : on garde le tirage même si le
  -- compte part, c'est la bande qui compte, pas son auteur.
  tire_par      uuid    references auth.users(id) on delete set null,
  tire_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now(),

  primary key (entreprise_id, zone_id)
);

comment on table public.entreprise_tirages_photos is
  'Dernier tirage de photos par entreprise et par zone. Fait foi : les pages du site en sont repeuplées après toute refonte ou clonage.';

-- La réparation d'une photo supprimée part de l'URL pour retrouver les
-- entreprises qui la montrent (`entreprisesMontrant`). Sans index, cette
-- recherche balaie la table à chaque suppression dans la médiathèque.
create index if not exists idx_tirages_photos_slots
  on public.entreprise_tirages_photos using gin (slots jsonb_path_ops);

create or replace function public.entreprise_tirages_photos_touch()
returns trigger
language plpgsql
as $$
begin
  new.maj_le := now();
  return new;
end $$;

drop trigger if exists trg_entreprise_tirages_photos_touch on public.entreprise_tirages_photos;
create trigger trg_entreprise_tirages_photos_touch
  before update on public.entreprise_tirages_photos
  for each row execute function public.entreprise_tirages_photos_touch();

alter table public.entreprise_tirages_photos enable row level security;

-- `is_staff()` et pas `authenticated` : un client du portail est lui aussi
-- `authenticated`, et n'a rien à faire dans les tirages du parc. Même
-- discipline que `site_briefs`. Les routes écrivent avec la clé de service,
-- qui passe outre RLS.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entreprise_tirages_photos'
      and policyname = 'entreprise_tirages_photos_staff'
  ) then
    create policy entreprise_tirages_photos_staff on public.entreprise_tirages_photos
      for all using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

commit;

-- RATTRAPAGE DU PARC. Les sites déjà tirés n'ont pas de ligne ici : leur
-- tirage n'existe que dans le JSON de leurs pages. La route
-- `/api/site-builder/admin/reappliquer-tirages` le récupère depuis les
-- pages quand il y est encore, et relance un tirage quand il a été perdu
-- (les 33 sites revenus au gabarit). À jouer une fois après migration.
