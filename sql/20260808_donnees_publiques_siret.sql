-- Socle de données publiques d'entreprise : SIRET → identité, taille, finances,
-- qualifications RGE.
--
-- POURQUOI
-- Le CRM ne portait aucun identifiant légal : ni `siret` ni `siren`. Les 41
-- SIREN déjà trouvés ne vivaient que dans le TEXTE des notes de `contacts`
-- (« SIREN 881400980, créée le 07/01/2020 »), donc illisibles par machine.
-- Sans cette clé, aucune donnée publique n'est atteignable : l'ADEME ne matche
-- QUE le SIRET, et `recherche-entreprises` ne rend un résultat fiable qu'à
-- partir d'un identifiant.
--
-- LES DEUX ÉTAGES, QU'IL NE FAUT PAS CONFONDRE
--   1. Résolution d'identité  nom+ville → SIRET : difficile, homonymes,
--      enseignes ≠ raisons sociales. Demande un jugement humain.
--      → `entreprise_siret_candidats`, avec un score et une validation.
--   2. Hydratation            SIRET → tout le reste : trivial, déterministe.
--      → `entreprises_donnees_publiques` + `entreprise_rge_qualifications`,
--        remplies par cron, sans LLM.
--
-- LE CHOIX DE CONCEPTION CENTRAL : UNE TABLE SÉPARÉE
-- La règle de sûreté « ne jamais écraser le saisi humain ni les colonnes
-- `*_official` » est une règle qu'on peut oublier. En isolant TOUT ce qui vient
-- des API dans une table 1:1 que rien d'humain n'écrit, la règle devient
-- structurelle : l'hydratation n'a simplement pas accès aux colonnes à
-- protéger. Un `update` mal ciblé sur `entreprises` reste possible ; un `update`
-- mal ciblé depuis l'hydratation ne l'est plus, elle n'écrit que dans sa table.
--
-- `siret` / `siren` font exception et vivent sur `entreprises` : ce sont des
-- clés d'identité validées par un humain, pas des données rafraîchies.
--
-- Idempotent, rejouable.

begin;

-- ---------------------------------------------------------------------------
-- 1. L'identité légale, sur `entreprises`
-- ---------------------------------------------------------------------------
alter table public.entreprises
  add column if not exists siret               text,
  add column if not exists siren               text,
  -- D'où vient la clé : 'note_contact' (extraite des notes existantes),
  -- 'resolution' (candidat proposé puis validé), 'saisie' (tapé à la main),
  -- 'api' (déduit d'un SIREN via recherche-entreprises).
  add column if not exists siret_source        text,
  add column if not exists siret_confirme_le   timestamptz,
  add column if not exists siret_confirme_par  uuid;

-- Formats stricts. Un SIRET est 14 chiffres, un SIREN 9 : accepter autre chose,
-- c'est garantir un appel d'API qui ne rendra rien, sans qu'on sache pourquoi.
do $$ begin
  alter table public.entreprises
    add constraint entreprises_siret_format check (siret is null or siret ~ '^[0-9]{14}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.entreprises
    add constraint entreprises_siren_format check (siren is null or siren ~ '^[0-9]{9}$');
exception when duplicate_object then null; end $$;

-- Cohérence : le SIREN est toujours les 9 premiers chiffres du SIRET. Deux
-- valeurs qui se contredisent seraient pires qu'une valeur absente — on ne
-- saurait plus laquelle interroger.
do $$ begin
  alter table public.entreprises
    add constraint entreprises_siren_prefixe_siret
    check (siret is null or siren is null or siren = left(siret, 9));
exception when duplicate_object then null; end $$;

-- Deux fiches actives sur le même SIRET sont un doublon, pas deux entreprises.
-- L'index l'empêche à l'insertion plutôt que de le faire découvrir en démo.
-- Restreint aux fiches non fusionnées : une fiche absorbée garde son SIRET.
create unique index if not exists entreprises_siret_unique_actif
  on public.entreprises (siret)
  where siret is not null and merged_into_id is null;

create index if not exists entreprises_siren_idx
  on public.entreprises (siren) where siren is not null;

comment on column public.entreprises.siret is
  'SIRET 14 chiffres de l''établissement retenu. Clé d''entrée de TOUTE donnée publique : l''ADEME ne matche que sur ce format.';
comment on column public.entreprises.siren is
  'SIREN 9 chiffres = left(siret, 9). Redondant à dessein : permet de chercher les qualifications RGE portées par un AUTRE établissement du même SIREN.';

-- ---------------------------------------------------------------------------
-- 2. Les données publiques, dans leur propre table
-- ---------------------------------------------------------------------------
-- 1:1 avec `entreprises`. Tout ici appartient aux API : l'hydratation écrase
-- librement, sans jamais risquer une donnée saisie à la main.
create table if not exists public.entreprises_donnees_publiques (
  entreprise_id bigint primary key references public.entreprises(id) on delete cascade,

  -- ── Identité (source: recherche-entreprises.api.gouv.fr) ─────────────────
  denomination            text,        -- nom_raison_sociale
  nom_complet             text,        -- nom_complet (inclut sigle/enseigne)
  sigle                   text,
  -- Les enseignes commerciales déclarées. C'est LA colonne qui réconcilie
  -- « HYGIS Evry » (l'enseigne affichée) avec « HYGIENE MORE » (la raison
  -- sociale) — le désaccord qui fait échouer toute recherche par nom.
  enseignes               text[]       not null default '{}',

  -- Date de création de l'UNITÉ LÉGALE, pas de l'établissement. Piège vérifié :
  -- ECLEIS a un siège créé en 2020 pour une entreprise née en 1989. C'est la
  -- date de l'unité légale qui fait l'ancienneté commerciale.
  date_creation           date,
  date_creation_etablissement date,
  date_fermeture          date,
  -- 'A' actif / 'C' cessé. Sortir les cessées de la prospection est une
  -- fonctionnalité, pas une anecdote : 3 cas connus au moment de l'écriture.
  etat_administratif      text check (etat_administratif is null or etat_administratif in ('A','C')),

  naf_code                text,        -- activite_principale (NAF 2008, ex: 43.22B)
  naf_code_2025           text,        -- activite_principale_naf25 (nomenclature 2025)
  naf_section             text,        -- section_activite_principale (ex: F)
  nature_juridique        text,        -- code INSEE (ex: 5499)
  categorie_entreprise    text,        -- PME / ETI / GE
  categorie_entreprise_annee text,

  -- ── Taille ────────────────────────────────────────────────────────────────
  -- CODE INSEE, pas un nombre : '01'=1-2, '02'=3-5, '03'=6-9, '11'=10-19,
  -- '12'=20-49, 'NN'=non renseigné. Afficher « effectif 12 » pour une
  -- entreprise de 30 personnes serait un contresens ; le libellé se calcule
  -- au rendu, jamais stocké comme un entier.
  tranche_effectif_code   text,
  tranche_effectif_annee  text,
  est_employeur           boolean,
  nb_etablissements       integer,
  nb_etablissements_ouverts integer,

  -- ── Finances ──────────────────────────────────────────────────────────────
  -- DEUX COLONNES, DEUX RÉGIMES — c'est le point à ne pas confondre.
  --
  -- `ca = 0` dans l'API signifie « NON PUBLIÉ », pas « zéro ». Mesuré sur
  -- l'échantillon : 8 entreprises ayant déposé des comptes, 6 sont à `ca: 0`
  -- avec un résultat net à cinq ou six chiffres. D'où le mapping vers NULL à
  -- l'écriture, verrouillé par le `check` ci-dessous : un 0 trompeur ne peut
  -- physiquement pas entrer dans la colonne.
  --
  -- `resultat_net` est stocké TEL QUEL, y compris négatif (-59 769 € observé,
  -- ce qui prouve que c'est une vraie valeur signée) et y compris un 0 réel.
  -- Aucun mapping vers NULL ici : sur ce même échantillon le résultat est
  -- publié 8 fois sur 8 là où le CA ne l'est que 2 fois sur 8. C'est le chiffre
  -- qu'on a presque toujours ; l'annuler sur un exercice à l'équilibre — rare
  -- mais réel — reviendrait à jeter la seule donnée financière disponible.
  --
  -- Deux colonnes distinctes et non l'une repliée sur l'autre : la plupart des
  -- artisans déposent des comptes confidentiels et publient le résultat SANS le
  -- chiffre d'affaires. Une fiche « CA inconnu, résultat 140 998 € » est un cas
  -- NORMAL, que l'affichage doit savoir rendre.
  chiffre_affaires        bigint check (chiffre_affaires is null or chiffre_affaires <> 0),
  resultat_net            bigint,
  exercice_annee          integer,
  -- L'historique complet tel que rendu par l'API ({"2023":{...},"2022":{...}}),
  -- pour pouvoir tracer une évolution sans réinterroger.
  finances_historique     jsonb        not null default '{}'::jsonb,

  -- ── Dirigeants ────────────────────────────────────────────────────────────
  -- Tableau brut : nom, prenoms, qualite, annee_de_naissance, type_dirigeant.
  -- Un liquidateur qui apparaît ici est un signal de mort commerciale.
  dirigeants              jsonb        not null default '[]'::jsonb,

  -- ── Divers utiles ─────────────────────────────────────────────────────────
  tva_intracommunautaire  text,
  idcc                    text[]       not null default '{}',  -- conventions collectives
  -- Le flag `complements.est_rge` de l'API. Gardé À TITRE INDICATIF SEULEMENT :
  -- la vérité sur les qualifications est l'ADEME, table ci-dessous. Le flag et
  -- l'ADEME peuvent diverger, et c'est l'ADEME qui fait foi.
  est_rge_indicatif       boolean,
  complements             jsonb        not null default '{}'::jsonb,

  -- Adresse du siège telle que déclarée à l'INSEE. Ne remplace pas
  -- `entreprises.adresse` (qui peut être saisie) : c'est la version officielle,
  -- utile pour départager deux homonymes.
  adresse_siege           text,
  code_postal_siege       text,
  ville_siege             text,
  commune_insee           text,
  lat_siege               double precision,
  lng_siege               double precision,

  -- ── Traçabilité ───────────────────────────────────────────────────────────
  -- Le SIRET effectivement interrogé, qui peut différer de `entreprises.siret`
  -- si celui-ci a changé depuis : sans lui on ne sait pas à quoi la ligne se
  -- rapporte.
  siret_interroge         text,
  -- Fraîcheur PAR SOURCE, parce que les cadences diffèrent : le RGE bouge
  -- quotidiennement, les comptes une fois l'an.
  identite_rafraichie_le  timestamptz,
  finances_rafraichies_le timestamptz,
  rge_rafraichi_le        timestamptz,
  -- Date de mise à jour annoncée PAR L'API elle-même (date_mise_a_jour) : dit
  -- si la source a bougé, là où nos timestamps ne disent que si on a regardé.
  source_maj_le           timestamptz,
  identite_erreur         text,
  rge_erreur              text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.entreprises_donnees_publiques is
  'Données publiques d''entreprise (recherche-entreprises.api.gouv.fr). Table 100 % possédée par l''hydratation automatique : aucune saisie humaine ici, donc aucun risque d''écraser du saisi. Fraîcheur suivie par source.';

create index if not exists edp_etat_administratif_idx
  on public.entreprises_donnees_publiques (etat_administratif)
  where etat_administratif = 'C';

create index if not exists edp_identite_fraicheur_idx
  on public.entreprises_donnees_publiques (identite_rafraichie_le nulls first);
create index if not exists edp_rge_fraicheur_idx
  on public.entreprises_donnees_publiques (rge_rafraichi_le nulls first);

-- ---------------------------------------------------------------------------
-- 3. Les qualifications RGE : une ligne par qualification
-- ---------------------------------------------------------------------------
-- Un compteur (« 4 RGE ») ne permet ni d'afficher les bons logos, ni de repérer
-- qu'une qualification expire dans deux mois. Une ligne par qualification, avec
-- ses dates, permet les deux.
--
-- Source : ADEME, jeu `liste-des-entreprises-rge-2`, alimenté par les
-- organismes certificateurs — JAMAIS déclaratif. L'entreprise n'a aucun moyen
-- d'y entrer ni d'en sortir. C'est ce qui rend l'ADEME plus fiable que le site
-- du client, qui peut afficher des logos non détenus (cas vérifié : ECLEIS
-- affiche des logos RGE alors que l'ADEME rend 0 ligne).
create table if not exists public.entreprise_rge_qualifications (
  id              uuid primary key default gen_random_uuid(),
  entreprise_id   bigint not null references public.entreprises(id) on delete cascade,

  -- Le SIRET porteur. Il peut différer du SIRET du siège : une entreprise
  -- multi-établissements peut être qualifiée sur un établissement secondaire.
  siret           text   not null,

  code_qualification text not null,
  -- Libellé du certificat, ex: 'QualiPAC module Chauffage et ECS'. C'est la clé
  -- de `public/rge/mapping.json` qui donne le fichier de logo. Attention :
  -- l'énumération ADEME compte 40 valeurs, alors que le mapping n'en couvre
  -- que 16 — les certificats d'audit nominatifs (CERTIFICAT_*) n'ont pas de
  -- logo, et c'est normal. Le rendu doit tolérer l'absence de logo.
  nom_certificat  text,
  -- Libellé long. ATTENTION : accents mutilés à la source (« gnrateur
  -- photovoltaque raccord au rseau »). À ne pas afficher tel quel.
  nom_qualification text,
  organisme       text,
  domaine         text,
  meta_domaine    text,
  particulier     boolean,
  url_qualification text,

  date_debut      date,
  -- La date qui ouvre une conversation commerciale : « je vois que votre
  -- QualiPAC arrive à échéance en septembre ».
  date_fin        date,

  -- ── Cycle de vie ──────────────────────────────────────────────────────────
  -- Une qualification retirée DISPARAÎT du jeu ADEME. On ne supprime pas la
  -- ligne pour autant : savoir qu'une entreprise a PERDU sa qualification est
  -- un renseignement, et une raison de retirer un logo d'une démo publiée.
  premiere_vue_le timestamptz not null default now(),
  derniere_vue_le timestamptz not null default now(),
  retiree_le      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Clé naturelle d'idempotence. `_id` de l'ADEME ('45415-32-2026-06-11') porte la
-- date de rafraîchissement du jeu et change donc à chaque publication : s'en
-- servir créerait un doublon par jour. Le triplet porteur/qualification/début
-- est stable.
--
-- Colonnes NUES et `nulls not distinct`, et non une expression `coalesce(...)` :
-- PostgREST ne sait viser depuis `on_conflict=` qu'un index sur des colonnes
-- réelles. Avec un index d'expression, l'upsert de l'hydratation échouerait à
-- chaque passage — ou insérerait un doublon par jour sans rien signaler.
-- `nulls not distinct` (PG 15+) fait qu'une `date_debut` absente reste une
-- seule et même clé, là où le défaut Postgres laisserait les NULL coexister.
create unique index if not exists erq_naturelle_unique
  on public.entreprise_rge_qualifications
     (entreprise_id, siret, code_qualification, date_debut)
  nulls not distinct;

create index if not exists erq_entreprise_idx
  on public.entreprise_rge_qualifications (entreprise_id) where retiree_le is null;
create index if not exists erq_expiration_idx
  on public.entreprise_rge_qualifications (date_fin) where retiree_le is null;

comment on table public.entreprise_rge_qualifications is
  'Qualifications RGE, une ligne par qualification (ADEME, quotidien). Les retraits sont marqués par `retiree_le`, jamais supprimés : une qualification perdue est un renseignement commercial.';

-- Vue de confort : ce qui est valide AUJOURD'HUI. `date_fin >= current_date`
-- n'est pas immutable, donc impossible en colonne générée — d'où la vue.
create or replace view public.v_rge_qualifications_valides as
  select q.*,
         (q.date_fin is not null and q.date_fin < current_date) as expiree,
         (q.date_fin is not null and q.date_fin >= current_date
            and q.date_fin < current_date + interval '90 days') as expire_bientot
  from public.entreprise_rge_qualifications q
  where q.retiree_le is null;

comment on view public.v_rge_qualifications_valides is
  'Qualifications non retirées, avec les drapeaux `expiree` et `expire_bientot` (90 j) — l''accroche d''appel.';

-- ---------------------------------------------------------------------------
-- 4. Candidats SIRET : la résolution d'identité, proposée et non imposée
-- ---------------------------------------------------------------------------
-- Le point dur. Les fiches viennent de Google Maps et portent des titres
-- commerciaux (« Eco Solutions 44 - Climatisation & Pompe à chaleur Nantes »)
-- qui ne sont pas des raisons sociales. Rencontré : HYGIS Evry immatriculée
-- « HYGIENE MORE », CLIMIZ = « TOP CLIMATISATION », Clim On = « JL2B
-- MATERIAUX ». Rapprocher automatiquement, c'est écrire un SIRET faux dans une
-- fiche et le propager ensuite à toutes les données publiques.
--
-- D'où : on PROPOSE, un humain TRANCHE. Rien n'écrit `entreprises.siret` sans
-- passage par `statut = 'valide'`.
create table if not exists public.entreprise_siret_candidats (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,

  siret         text not null check (siret ~ '^[0-9]{14}$'),
  siren         text not null check (siren ~ '^[0-9]{9}$'),

  -- Instantané de ce que l'API disait au moment de la proposition : permet de
  -- juger sur pièces sans re-télécharger, et garde une trace si l'entreprise
  -- change de nom ensuite.
  denomination  text,
  enseignes     text[] not null default '{}',
  adresse       text,
  code_postal   text,
  ville         text,
  etat_administratif text,
  naf_code      text,

  -- Score de concordance 0-100 et son détail (nom, ville, CP, activité,
  -- téléphone…). Le détail est affiché : un score nu ne se conteste pas, un
  -- score décomposé se relit.
  score         integer not null check (score between 0 and 100),
  score_detail  jsonb   not null default '{}'::jsonb,
  -- Rang dans la proposition (1 = meilleur). Deux candidats à 2 points d'écart
  -- doivent se voir côte à côte.
  rang          integer not null default 1,

  statut        text not null default 'propose'
                check (statut in ('propose','valide','rejete')),
  decide_le     timestamptz,
  decide_par    uuid,
  -- Ce que l'humain a tapé pour justifier : « SIRET lu sur le site », etc.
  commentaire   text,

  created_at    timestamptz not null default now()
);

create unique index if not exists esc_entreprise_siret_unique
  on public.entreprise_siret_candidats (entreprise_id, siret);
create index if not exists esc_a_trancher_idx
  on public.entreprise_siret_candidats (entreprise_id, rang) where statut = 'propose';

comment on table public.entreprise_siret_candidats is
  'Candidats SIRET proposés pour une fiche, avec score de concordance décomposé. Aucun SIRET ne rejoint `entreprises` sans validation humaine (statut=valide).';

-- ---------------------------------------------------------------------------
-- 5. Journal des passages
-- ---------------------------------------------------------------------------
-- `cron.job_run_details` ne dit que si la requête HTTP a été POSTÉE, pas ce
-- qu'elle a fait. Sans ce journal, un cron qui ne rafraîchit plus rien est
-- indiscernable d'un cron qui n'a rien à rafraîchir — exactement le mode de
-- panne du vérificateur d'emails, silencieux depuis le 3 août.
create table if not exists public.donnees_publiques_runs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  entreprise_id bigint references public.entreprises(id) on delete set null,

  source        text not null check (source in ('recherche_entreprises','ademe_rge')),
  -- 'bouton' (une fiche, à la demande) | 'cron' | 'backfill'
  declencheur   text not null default 'cron',
  statut        text not null check (statut in ('ok','vide','erreur','ignore')),
  -- Raison courte et agrégeable : 'pas_de_siret', 'http_429', 'aucun_resultat'…
  motif         text,
  message       text,
  siret         text,
  -- Ce que le passage a changé, pour distinguer « rien à faire » de « rien fait ».
  champs_ecrits integer not null default 0,
  rge_ajoutees  integer not null default 0,
  rge_retirees  integer not null default 0,
  duree_ms      integer
);

create index if not exists dpr_created_idx on public.donnees_publiques_runs (created_at desc);
create index if not exists dpr_entreprise_idx on public.donnees_publiques_runs (entreprise_id, created_at desc);

comment on table public.donnees_publiques_runs is
  'Journal append-only de l''hydratation, une ligne par entreprise et par source. Distingue « rien à faire » de « rien fait » — le mode de panne silencieux qu''on veut pouvoir voir.';

-- ---------------------------------------------------------------------------
-- 6. Réglages : les cadences
-- ---------------------------------------------------------------------------
-- Même forme que `regulator_settings` / `enrichment_geo_settings` : une ligne
-- unique, éditable sans redéploiement.
create table if not exists public.donnees_publiques_settings (
  id                     text primary key default 'global' check (id = 'global'),
  -- L'ADEME publie quotidiennement, et une qualification qui expire est un
  -- motif d'appel périssable.
  rge_ttl_heures         integer not null default 24  check (rge_ttl_heures between 1 and 8760),
  -- L'identité bouge peu, mais `etat_administratif` passant à 'C' doit être vu
  -- vite : c'est ce qui arrête une prospection sur une entreprise morte.
  identite_ttl_heures    integer not null default 720 check (identite_ttl_heures between 1 and 8760),
  -- Les comptes sont déposés une fois l'an. Cette valeur ne DÉCLENCHE pas
  -- d'appel supplémentaire — les finances arrivent dans la même réponse que
  -- l'identité, donc gratuitement — elle borne la fraîcheur qu'on exige avant
  -- d'afficher un CA comme « à jour ».
  finances_ttl_heures    integer not null default 8760 check (finances_ttl_heures between 1 and 8760),
  -- Plafond par passage de cron, pour tenir sous `maxDuration`.
  lot_max                integer not null default 40 check (lot_max between 1 and 500),
  actif                  boolean not null default true,
  updated_at             timestamptz not null default now()
);

insert into public.donnees_publiques_settings (id) values ('global')
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Qui est à rafraîchir ?
-- ---------------------------------------------------------------------------
-- Une vue plutôt qu'un `where` recopié dans la route : la définition de
-- « périmé » ne doit exister qu'à un seul endroit.
create or replace view public.v_donnees_publiques_a_rafraichir as
  with s as (select * from public.donnees_publiques_settings where id = 'global')
  select
    e.id                as entreprise_id,
    e.siret,
    e.siren,
    d.identite_rafraichie_le,
    d.rge_rafraichi_le,
    (d.entreprise_id is null
       or d.identite_rafraichie_le is null
       or d.identite_rafraichie_le < now() - make_interval(hours => s.identite_ttl_heures)
    ) as identite_due,
    (d.entreprise_id is null
       or d.rge_rafraichi_le is null
       or d.rge_rafraichi_le < now() - make_interval(hours => s.rge_ttl_heures)
    ) as rge_due
  from public.entreprises e
  cross join s
  left join public.entreprises_donnees_publiques d on d.entreprise_id = e.id
  where e.siret is not null
    and e.merged_into_id is null;

comment on view public.v_donnees_publiques_a_rafraichir is
  'Fiches dotées d''un SIRET, avec le verdict de péremption par source selon les TTL réglés. Source unique de la définition de « périmé ».';

-- ---------------------------------------------------------------------------
-- 8. `updated_at`
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists edp_touch on public.entreprises_donnees_publiques;
create trigger edp_touch before update on public.entreprises_donnees_publiques
  for each row execute function public.touch_updated_at();

drop trigger if exists erq_touch on public.entreprise_rge_qualifications;
create trigger erq_touch before update on public.entreprise_rge_qualifications
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
-- Écritures en service_role (qui contourne la RLS) depuis les routes API :
-- aucune policy d'écriture n'est donc nécessaire. Lecture au personnel, qui a
-- besoin de ces données en préparation d'appel.
alter table public.entreprises_donnees_publiques   enable row level security;
alter table public.entreprise_rge_qualifications   enable row level security;
alter table public.entreprise_siret_candidats      enable row level security;
alter table public.donnees_publiques_runs          enable row level security;
alter table public.donnees_publiques_settings      enable row level security;

drop policy if exists "staff read edp" on public.entreprises_donnees_publiques;
create policy "staff read edp" on public.entreprises_donnees_publiques
  for select using (public.is_staff());

drop policy if exists "staff read erq" on public.entreprise_rge_qualifications;
create policy "staff read erq" on public.entreprise_rge_qualifications
  for select using (public.is_staff());

drop policy if exists "staff read esc" on public.entreprise_siret_candidats;
create policy "staff read esc" on public.entreprise_siret_candidats
  for select using (public.is_staff());

drop policy if exists "admin read dpr" on public.donnees_publiques_runs;
create policy "admin read dpr" on public.donnees_publiques_runs
  for select using (public.is_admin());

drop policy if exists "admin all dps" on public.donnees_publiques_settings;
create policy "admin all dps" on public.donnees_publiques_settings
  for all using (public.is_admin()) with check (public.is_admin());

commit;
