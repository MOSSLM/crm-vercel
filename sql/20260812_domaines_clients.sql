-- =====================================================================
-- Domaines clients — unicité de `published_domain`
-- =====================================================================
-- CE QUE ÇA CORRIGE. `sites.published_subdomain` porte DEUX garde-fous
-- d'unicité (contrainte de colonne + index unique, 20260505_site_builder_v2
-- lignes 9 et 16-18). `published_domain`, en face, n'a qu'un index ORDINAIRE
-- (lignes 10 et 20-22). Rien n'empêchait donc deux sites de revendiquer
-- « plomberie-dupont.fr » — une régénération qui crée un second site, un
-- copier-coller dans un formulaire — et le résolveur faisait un `.single()`
-- dessus : à deux lignes, PostgREST rend la MÊME erreur PGRST116 que pour
-- zéro ligne, que le code avalait en silence comme « hôte inconnu ordinaire ».
-- Le domaine du client qui paie tombait en 404 avec un journal serveur VIDE.
--
-- POURQUOI MAINTENANT, ET POURQUOI C'EST GRATUIT. Au moment d'écrire ce
-- fichier la production compte 128 sites, 36 publiés et ZÉRO domaine
-- personnalisé. Il n'y a donc ni doublon à arbitrer, ni migration de données,
-- ni risque. La fenêtre se referme dès le premier domaine attaché.
--
-- POURQUOI `lower()`. La lecture compare l'en-tête Host — que le client
-- envoie dans la casse qu'il veut — à la valeur stockée. Le code normalise
-- des deux côtés (canonicalizeDomain à l'écriture, normalizeHost à la
-- lecture), mais un index sur la valeur brute laisserait passer
-- « Exemple.fr » et « exemple.fr » comme deux lignes distinctes, ce que la
-- normalisation applicative est précisément censée rendre impossible.
--
-- POURQUOI PARTIEL. La dépublication (DELETE /publish) ne touche que
-- `is_published` et CONSERVE le domaine : un client peut revenir. L'index ne
-- doit donc pas dépendre de l'état de publication, mais il doit ignorer les
-- NULL — sinon les 128 sites sans domaine entreraient en collision entre eux.
--
-- CONSÉQUENCE À CONNAÎTRE : le domaine reste réservé après dépublication.
-- C'est voulu, mais ça veut dire qu'un offboarding doit explicitement libérer
-- la valeur (publishSite accepte désormais `domain: null` pour ça).

begin;

-- Normalisation de rattrapage. Sans elle l'index ci-dessous échouerait sur un
-- doublon de casse, et surtout `.eq("published_domain", host)` ne matcherait
-- jamais une valeur préfixée par le protocole — forme dont le dépôt documente
-- l'existence (en-tête de src/lib/site-builder/demo-share-url.ts, et cinq
-- lecteurs qui font `startsWith("http")` pour s'en accommoder).
-- Miroir SQL exact de `canonicalizeDomain` (src/lib/url-canonical.ts) :
-- minuscules, sans protocole, sans `www.`, sans chemin, sans port.
update public.sites
   set published_domain = regexp_replace(
         regexp_replace(
           regexp_replace(lower(btrim(published_domain)), '^[a-z][a-z0-9+.-]*://', ''),
           '^www\.', ''),
         '[/:].*$', '')
 where published_domain is not null
   and published_domain <> regexp_replace(
         regexp_replace(
           regexp_replace(lower(btrim(published_domain)), '^[a-z][a-z0-9+.-]*://', ''),
           '^www\.', ''),
         '[/:].*$', '');

-- Une valeur devenue vide après normalisation n'était pas un domaine.
update public.sites set published_domain = null
 where published_domain is not null and btrim(published_domain) = '';

drop index if exists public.idx_sites_published_domain;

create unique index if not exists idx_sites_published_domain_unique
  on public.sites (lower(published_domain))
  where published_domain is not null;

comment on index public.idx_sites_published_domain_unique is
  'Un domaine ne désigne qu''un site. Remplace un index non unique : sans lui, deux lignes rendaient le domaine du client irrésoluble (.single() → PGRST116, avalé comme « hôte inconnu »).';

-- `published_at` est écrit à CHAQUE publication (src/lib/site-builder/
-- publish-site.ts) mais n'a jamais été créé par aucune migration, et ne figure
-- pas dans la liste de contrôle de sql/RATTRAPAGE_colonnes_sites.sql :
-- `updateDroppingMissingColumns` la retire silencieusement à chaque appel, avec
-- un console.warn que personne ne lit. La comptabilité de publication fuit donc
-- déjà — et c'est exactement l'horodatage dont un cycle de vie de domaine a
-- besoin pour décider quand un 302 peut devenir un 308.
alter table public.sites add column if not exists published_at timestamptz;

comment on column public.sites.published_at is
  'Dernière publication. Écrite par publishSite depuis toujours ; la colonne, elle, manquait.';

commit;
