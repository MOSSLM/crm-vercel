-- Rendre le CRM utilisable avec 60 000 entreprises.
--
-- Contexte : `entreprises` est passée à ~60 000 lignes et plus aucun écran ne
-- charge. Deux causes côté base, traitées ici (la troisième, la boucle de
-- pagination du navigateur, se corrige côté application).
--
-- 1. La RLS est évaluée PAR LIGNE.
--    `EXPLAIN` en production sur un simple `select … from entreprises
--    order by created_at desc limit 500 offset 20000` :
--
--      Filter: ((is_freelance() AND ((owner_id = …) OR (owner_id IS NULL)))
--               OR is_admin())
--      Execution Time: 1519.974 ms      -- rôle authenticated
--      Execution Time:   72.563 ms      -- même requête en service_role
--
--    Soit ~20×, parce que `is_admin()` et `is_freelance()` enveloppent chacune
--    un `select exists (select 1 from user_profiles …)` : appelées nues dans un
--    qual de politique, elles ne sont pas remontées en InitPlan et s'exécutent
--    une fois par ligne — ~120 000 sous-requêtes par balayage complet.
--
--    C'est exactement le défaut que `20260524_wrap_rls_auth_calls_in_select.sql`
--    avait corrigé pour `auth.uid()` / `auth.role()`. Cette passe-là ne
--    connaissait pas `is_admin()` / `is_freelance()`, introduites 10 jours plus
--    tard par `20260603_agent_portal_ownership.sql`, ni `is_staff()`, posée en
--    masse par `20260529_fix_rls_recursion.sql`. Les ~150 politiques concernées
--    sont réécrites ici.
--
-- 2. Les chemins chauds n'ont pas d'index : file de qualification, recherche
--    texte, médiane d'avis par ville, résolution d'e-mail des webhooks.
--
-- Puis on outille l'application pour qu'elle cesse de rapatrier le corpus :
-- une vue « périmètre actif » (~1 100 fiches réellement exploitées par le CRM,
-- sur 60 944) et une RPC de compteurs, pour remplacer les
-- `companies.filter(...).length` faits en JS sur 60 000 objets.
--
-- Note : le DDL de base de `entreprises` ne vit pas dans ce dépôt (table créée
-- hors migration). Les index ci-dessous ont été choisis en lisant les index
-- RÉELLEMENT présents en base, pas les fichiers `sql/`. Existent déjà et ne
-- sont donc pas recréés : entreprises_created_at_idx,
-- entreprises_service_tags_gin_idx, entreprises_merged_into_id_idx,
-- idx_entreprises_owner_id, idx_entreprises_actives.

set search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. RLS : remonter is_admin() / is_freelance() / is_staff() en InitPlan
-- ───────────────────────────────────────────────────────────────────────────
--
-- `(select f())` suffit : le planificateur reconnaît un sous-select sans
-- corrélation, l'évalue une fois pour la requête entière et réutilise le
-- résultat. Sémantique inchangée — les fonctions sont STABLE et sans argument.
--
-- On passe par `ALTER POLICY` plutôt que DROP + CREATE : la commande (SELECT /
-- INSERT / UPDATE / ALL) et la liste de rôles sont conservées telles quelles,
-- donc aucun risque de recréer une politique plus permissive que l'originale
-- en se trompant de clause. Et à aucun instant la table ne se retrouve sans
-- politique.
--
-- La réécriture est textuelle et doublement ancrée :
--   `(?<![.[:alnum:]_])` empêche de toucher à un nom de fonction plus long ou
--                        déjà qualifié (`public.is_admin()`) ;
--   `(?<!SELECT )`       rend le script idempotent.
--
-- Ce second garde-fou n'est pas décoratif. Après réécriture, `pg_get_expr`
-- restitue l'expression sous la forme normalisée `( SELECT is_staff() AS
-- is_staff)` — SANS le préfixe `public.` qu'on avait écrit, puisque `public`
-- est dans le search_path. Sans `(?<!SELECT )`, une seconde exécution
-- rematcherait ce `is_staff()` et produirait `( SELECT (select
-- public.is_staff()) AS is_staff)`, puis empilerait une couche à chaque passage.
--
-- Gain mesuré en production sur `select … from entreprises order by created_at
-- desc limit 500 offset 20000`, rôle authenticated, cache chaud, même session :
--
--   avant : Buffers shared hit=43894   Execution Time: 569.338 ms
--   après : Buffers shared hit= 2883   Execution Time:  16.182 ms
--
-- Les ~41 000 buffers de différence sont les lectures de `user_profiles`
-- refaites une fois par ligne.
do $$
declare
  r record;
  nouveau_qual text;
  nouveau_check text;
  n_modifiees int := 0;
begin
  for r in
    select
      p.polname,
      c.relname,
      pg_get_expr(p.polqual, p.polrelid)      as qual,
      pg_get_expr(p.polwithcheck, p.polrelid) as withcheck
    from pg_policy p
    join pg_class c     on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    nouveau_qual := regexp_replace(
      r.qual,
      '(?<![.[:alnum:]_])(?<!SELECT )(is_admin|is_freelance|is_staff)\(\)',
      '(select public.\1())',
      'g'
    );
    nouveau_check := regexp_replace(
      r.withcheck,
      '(?<![.[:alnum:]_])(?<!SELECT )(is_admin|is_freelance|is_staff)\(\)',
      '(select public.\1())',
      'g'
    );

    -- USING et WITH CHECK sont altérés séparément : une politique INSERT n'a
    -- pas de USING, une politique SELECT n'a pas de WITH CHECK, et passer la
    -- clause absente lèverait une erreur.
    if r.qual is not null and nouveau_qual is distinct from r.qual then
      execute format('alter policy %I on public.%I using (%s)',
                     r.polname, r.relname, nouveau_qual);
      n_modifiees := n_modifiees + 1;
    end if;

    if r.withcheck is not null and nouveau_check is distinct from r.withcheck then
      execute format('alter policy %I on public.%I with check (%s)',
                     r.polname, r.relname, nouveau_check);
    end if;
  end loop;

  raise notice 'RLS : % politiques réécrites en (select …)', n_modifiees;
end $$;

-- Même défaut, autre famille : sept politiques posées après la passe de
-- 20260524 appellent `auth.role()` nu. Trois d'entre elles portent sur des
-- tables jointes fiche par fiche par les écrans d'audit
-- (`entreprises_audit_site`, `entreprises_audit_psi`,
-- `entreprises_rapport_public`), donc le coût par ligne se paie sur le même
-- chemin que celui qu'on vient de corriger.
--
-- `auth.uid`/`auth.jwt`/`current_setting` sont inclus par sûreté : aucune
-- politique ne les porte nus aujourd'hui, mais la règle est la même et le bloc
-- devient le filet pour les prochaines.
do $$
declare
  r record;
  nouveau_qual text;
  nouveau_check text;
  n_modifiees int := 0;
  motif constant text :=
    '(?<![.[:alnum:]_])(?<!SELECT )(auth\.role|auth\.uid|auth\.jwt|current_setting)\(([^()]*)\)';
begin
  for r in
    select
      p.polname,
      c.relname,
      pg_get_expr(p.polqual, p.polrelid)      as qual,
      pg_get_expr(p.polwithcheck, p.polrelid) as withcheck
    from pg_policy p
    join pg_class c     on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    nouveau_qual  := regexp_replace(r.qual,      motif, '(select \1(\2))', 'g');
    nouveau_check := regexp_replace(r.withcheck, motif, '(select \1(\2))', 'g');

    if r.qual is not null and nouveau_qual is distinct from r.qual then
      execute format('alter policy %I on public.%I using (%s)',
                     r.polname, r.relname, nouveau_qual);
      n_modifiees := n_modifiees + 1;
    end if;

    if r.withcheck is not null and nouveau_check is distinct from r.withcheck then
      execute format('alter policy %I on public.%I with check (%s)',
                     r.polname, r.relname, nouveau_check);
    end if;
  end loop;

  raise notice 'RLS : % politiques auth.*() réécrites', n_modifiees;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Index des chemins chauds
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;

-- File de qualification : le chemin le plus chaud du CRM. Index partiel, donc
-- il ne porte que les fiches réellement dans la file. `id` en second permet la
-- pagination keyset de /api/entreprises/file sans tri supplémentaire.
create index if not exists entreprises_file_qualif_idx
  on public.entreprises (created_at desc, id)
  where qualifie = false
    and hidden_in_qualification is not true
    and archived_at is null
    and merged_into_id is null;

-- Périmètre actif et compteurs.
create index if not exists entreprises_qualifie_idx
  on public.entreprises (qualifie, created_at desc)
  where archived_at is null and merged_into_id is null;

-- Recherche serveur (Cmd+K, sélecteurs d'entreprise, file de qualification).
-- Trois index GIN distincts plutôt qu'un index composite : la recherche est un
-- OR entre colonnes, que le planificateur résout en BitmapOr des trois.
create index if not exists entreprises_name_trgm_idx
  on public.entreprises using gin (name gin_trgm_ops);
create index if not exists entreprises_ville_trgm_idx
  on public.entreprises using gin (ville gin_trgm_ops);
create index if not exists entreprises_adresse_trgm_idx
  on public.entreprises using gin (adresse gin_trgm_ops);

-- Le sélecteur du cockpit RDV cherche aussi par numéro de téléphone, et
-- délibérément : quand quelqu'un rappelle, le numéro affiché est souvent la
-- seule chose qu'on sache de lui. Il comparait les chiffres seuls, en mémoire,
-- pour que « 06 12 34 » retrouve « +33 6 12 34 56 78 » — ce que la colonne
-- `telephone` brute ne permet pas en SQL.
--
-- Colonne générée plutôt que normalisation à la volée : un `regexp_replace`
-- dans le WHERE serait non-sargable et rendrait l'index inutile.
alter table public.entreprises
  add column if not exists telephone_chiffres text
  generated always as (regexp_replace(coalesce(telephone, ''), '\D', '', 'g')) stored;

create index if not exists entreprises_tel_chiffres_trgm_idx
  on public.entreprises using gin (telephone_chiffres gin_trgm_ops);

-- src/lib/audit/dossier.ts : médiane d'avis par commune, un balayage complet
-- par audit généré aujourd'hui.
create index if not exists entreprises_ville_idx
  on public.entreprises (ville);

-- src/app/api/webhooks/resend/route.ts : `ilike('email', …)` sans joker, donc
-- une égalité insensible à la casse — un balayage séquentiel de 60 000 lignes
-- à chaque webhook Resend entrant.
create index if not exists entreprises_email_lower_idx
  on public.entreprises (lower(email));

analyze public.entreprises;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Périmètre actif
-- ───────────────────────────────────────────────────────────────────────────
--
-- Ce que le CRM exploite réellement : ~1 100 fiches sur 60 944. Le reste est un
-- corpus de prospection qui ne sert qu'à trois choses — la file de
-- qualification, le compteur de stock, la carte de France — et aucune des trois
-- n'a besoin des fiches en mémoire dans le navigateur.
--
-- La définition vit ici et nulle part ailleurs : c'est elle qui décide de ce que
-- `AppDataContext` charge au démarrage.
create or replace view public.v_entreprises_perimetre_actif
with (security_invoker = on) as
select e.*
from public.entreprises e
where e.qualifie
   or e.archived_at is not null
   or e.reseau_id is not null
   or e.owner_id is not null
   or exists (select 1 from public.opportunites o where o.entreprise_id = e.id)
   or exists (select 1 from public.contacts c     where c.entreprise_id = e.id);

comment on view public.v_entreprises_perimetre_actif is
  'Fiches réellement exploitées par le CRM (qualifiées, archivées, en réseau, '
  'attribuées, ou portant une opportunité / un contact). Le corpus de '
  'prospection restant ne s''atteint que par /api/entreprises/file, paginé.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Compteurs
-- ───────────────────────────────────────────────────────────────────────────
--
-- Remplace les balayages JS de QualificationPage (`companies.filter(...).length`
-- répété quatre fois, sans mémoïsation, sur 60 000 objets) et de Dashboard2Page.
--
-- SECURITY DEFINER assumé : ce sont des chiffres de stock globaux, les mêmes
-- pour tout le staff. Droits restreints comme dans
-- 20260524_revoke_definer_rpcs_from_anon_authenticated.sql.
create or replace function public.entreprises_compteurs()
returns table (
  a_qualifier bigint,
  qualifiees  bigint,
  masquees    bigint,
  archivees   bigint,
  stock_total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (
      where not qualifie
        and hidden_in_qualification is not true
        and archived_at is null
        and merged_into_id is null),
    count(*) filter (where qualifie and archived_at is null),
    count(*) filter (
      where not qualifie
        and hidden_in_qualification
        and archived_at is null),
    count(*) filter (where archived_at is not null),
    count(*) filter (where merged_into_id is null)
  from public.entreprises;
$$;

revoke all on function public.entreprises_compteurs() from public, anon;
grant execute on function public.entreprises_compteurs() to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. File de qualification
-- ───────────────────────────────────────────────────────────────────────────
--
-- L'écran de qualification filtrait les 60 000 fiches en mémoire, sans
-- mémoïsation, à chaque rendu — donc à chaque frappe dans la recherche — en
-- appelant `isDuplicate()` par fiche, lui-même un balayage des groupes de
-- doublons. Tout redescend en SQL.
--
-- Une fonction plutôt qu'une lecture PostgREST parce que deux filtres ne
-- s'expriment pas en paramètres d'URL : « masquer les doublons » demande de
-- savoir quels domaines apparaissent plus d'une fois, et la blacklist demande
-- une jointure sur `url_blacklist`.

/**
 * Domaine canonique d'une URL : sans protocole, sans `www.`, sans port, sans
 * chemin ni query, en minuscules. Reproduit `canonicalizeDomain` de
 * src/lib/url-canonical.ts, qui reste la référence côté application.
 * IMMUTABLE, condition pour servir de colonne générée.
 */
create or replace function public.domaine_canonique(u text)
returns text language sql immutable parallel safe as $$
  select nullif(
    lower(
      split_part(
        split_part(
          split_part(
            split_part(
              regexp_replace(
                regexp_replace(coalesce(u, ''), '^\s*https?://', '', 'i'),
                '^www\.', '', 'i'),
              '/', 1),
            '?', 1),
          '#', 1),
        ':', 1)
    ),
  '');
$$;

alter table public.entreprises
  add column if not exists domaine_canonique text
  generated always as (
    public.domaine_canonique(coalesce(canonical_url, site_web_canonique))
  ) stored;

create index if not exists entreprises_domaine_actifs_idx
  on public.entreprises (domaine_canonique)
  where domaine_canonique is not null and merged_into_id is null;

-- Index couvrant, calqué exactement sur le prédicat ET sur le tri de l'onglet
-- « file ».
--
-- L'ordre des colonnes n'est pas cosmétique. Une première version indexait
-- (created_at desc, id) — id ASCENDANT — alors que la page trie
-- (created_at desc, id desc) : l'ordre ne correspondait pas, PostgreSQL
-- retombait sur un tri, et ce tri coûtait 685 ms. Parce que les dates ne sont
-- pas distinctes : l'import ADEME a posé le MÊME `created_at` sur 15 023
-- fiches, et 22 323 sur la valeur suivante. Il fallait trier ce groupe entier
-- d'ex æquo pour en afficher douze.
--
-- `domaine_canonique` en INCLUDE : le filtrage doublons/blacklist le lit sans
-- retourner au tas.
create index if not exists entreprises_file_queue_cover_idx
  on public.entreprises (created_at desc, id desc)
  include (domaine_canonique)
  where qualifie = false
    and hidden_in_qualification is not true
    and archived_at is null
    and merged_into_id is null;

-- Domaines portés par plus d'une fiche active : ce que « masquer les doublons »
-- retire de la file.
--
-- Recalculé à chaque ouverture de page, ce test coûtait 25 657 sous-requêtes
-- corrélées (~400 ms) : la file affiche 12 lignes, elle n'a pas à ré-agréger
-- 60 000 lignes pour les produire. Le jeu ne bouge que quand un crawl ajoute
-- des fiches ou qu'une URL change — une vue matérialisée décrit exactement
-- cette cadence.
create materialized view if not exists public.mv_domaines_doublons as
select domaine_canonique, count(*) as nb
from public.entreprises
where domaine_canonique is not null and merged_into_id is null
group by 1
having count(*) > 1;

-- Unique : condition d'un REFRESH ... CONCURRENTLY, qui ne verrouille pas la
-- vue en lecture pendant le rafraîchissement.
create unique index if not exists mv_domaines_doublons_pk
  on public.mv_domaines_doublons (domaine_canonique);

grant select on public.mv_domaines_doublons to authenticated, service_role;

-- Rafraîchissement toutes les 15 min. pg_cron est déjà l'ordonnanceur du projet
-- (cf. 20260524_pg_cron_process_scheduled_actions.sql).
--   select cron.unschedule('refresh-mv-domaines-doublons');  -- pour retirer
select cron.schedule(
  'refresh-mv-domaines-doublons',
  '*/15 * * * *',
  $$ refresh materialized view concurrently public.mv_domaines_doublons $$
);

/**
 * Une page de la file de qualification, filtres appliqués en base.
 *
 * `total` est exact pour les filtres demandés, blacklist et doublons compris :
 * la pagination numérotée de l'écran reste juste. C'est la différence avec le
 * `total` approximatif de /api/agent/qualification/queue, qui filtre la
 * blacklist en mémoire et le documente comme tel.
 *
 * `fiche` est un jsonb plutôt que 33 colonnes déclarées : la liste des colonnes
 * de `entreprises` bouge, la signature de la fonction n'a pas à bouger avec.
 *
 * Coût mesuré, onglet file sans filtre : 3 314 ms à la première écriture,
 * 125 ms après l'index ci-dessus et la vue matérialisée.
 */
create or replace function public.entreprises_file(
  p_onglet            text    default 'queue',
  p_q                 text    default null,
  p_sources           text[]  default null,
  p_url_filter        text    default 'all',
  p_masquer_doublons  boolean default true,
  p_limit             int     default 12,
  p_offset            int     default 0
)
returns table (fiche jsonb, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filtre text;
  v_total  bigint;
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_d      text := nullif(regexp_replace(coalesce(p_q, ''), '\D', '', 'g'), '');
begin
  -- Le prédicat est construit une fois puis servi au comptage ET à la page :
  -- écrit deux fois, il finirait par diverger, et l'écran afficherait un total
  -- qui ne correspond pas à ce qu'il liste.
  v_filtre := 'e.merged_into_id is null and ' ||
    case p_onglet
      when 'qualified' then 'e.qualifie and e.archived_at is null'
      when 'hidden'    then 'not e.qualifie and e.hidden_in_qualification and e.archived_at is null'
      -- `is not true` couvre false ET null : la colonne a été ajoutée après
      -- coup, les anciennes lignes sont restées à null.
      else 'not e.qualifie and e.hidden_in_qualification is not true and e.archived_at is null'
    end;

  if p_sources is not null and cardinality(p_sources) > 0 then
    v_filtre := v_filtre || ' and e.sources && $2';
  end if;

  if p_url_filter = 'with-url' then
    v_filtre := v_filtre || ' and nullif(btrim(coalesce(e.canonical_url, '''')), '''') is not null';
  elsif p_url_filter = 'without-url' then
    v_filtre := v_filtre || ' and nullif(btrim(coalesce(e.canonical_url, '''')), '''') is null';
  end if;

  if v_q is not null then
    v_filtre := v_filtre ||
      ' and (e.name ilike ''%''||$1||''%'' or e.ville ilike ''%''||$1||''%''' ||
      ' or e.adresse ilike ''%''||$1||''%''' ||
      -- Le numéro compte autant que le nom : c'est souvent la seule chose
      -- qu'on sache d'un prospect qui rappelle. En dessous de 4 chiffres le
      -- motif ramènerait la moitié de la table.
      case when v_d is not null and length(v_d) >= 4
           then ' or e.telephone_chiffres ilike ''%''||$3||''%'''
           else '' end ||
      ')';
  end if;

  -- Blacklist et doublons ne s'appliquent qu'à la file à traiter : sur
  -- « qualifiées » et « masquées » on veut voir ce qui existe, y compris ce
  -- qu'on a écarté.
  if p_onglet = 'queue' then
    v_filtre := v_filtre ||
      ' and (e.domaine_canonique is null or not exists (' ||
      '   select 1 from public.url_blacklist b' ||
      '   where b.active and public.domaine_canonique(b.value) = e.domaine_canonique))';

    if p_masquer_doublons then
      v_filtre := v_filtre ||
        ' and (e.domaine_canonique is null or not exists (' ||
        '   select 1 from public.mv_domaines_doublons d' ||
        '   where d.domaine_canonique = e.domaine_canonique))';
    end if;
  end if;

  execute 'select count(*) from public.entreprises e where ' || v_filtre
    into v_total
    using v_q, p_sources, v_d;

  return query execute
    'select to_jsonb(e) - ''telephone_chiffres'' - ''domaine_canonique'', $6' ||
    ' from public.entreprises e where ' || v_filtre ||
    ' order by e.created_at desc, e.id desc limit $4 offset $5'
    using v_q, p_sources, v_d, greatest(p_limit, 0), greatest(p_offset, 0), v_total;

  -- Le total voyage sur chaque ligne ; une page vide n'en porterait donc
  -- aucune, et l'appelant lirait 0. Or « page au-dela de la fin » et « aucun
  -- resultat » sont deux situations differentes : la premiere doit garder son
  -- total pour que la pagination sache revenir en arriere. On emet donc une
  -- ligne sans fiche, que la route retire de la liste.
  if not found then
    return query select null::jsonb, v_total;
  end if;
end;
$$;

revoke all on function public.entreprises_file(text, text, text[], text, boolean, int, int) from public, anon;
grant execute on function public.entreprises_file(text, text, text[], text, boolean, int, int) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Carte de France
-- ───────────────────────────────────────────────────────────────────────────
--
-- /carte faisait trois paginations completes depuis le navigateur — 61 requetes
-- pour `entreprises` seule — puis recomposait le statut de chaque fiche en JS et
-- resolvait son departement par un test point-dans-polygone execute 60 000 fois
-- sur le thread principal.
--
-- Le departement se derive du code postal : 59 676 fiches sur 60 944 (98 %) en
-- portent un exploitable. Le statut se derive de `qualifie`,
-- `hidden_in_qualification`, `archived_at` et de l'etape de pipeline la plus
-- avancee, en reproduisant src/lib/carte/statuts.ts.
--
-- L'agregat national pese 101 ko contre ~10 Mo de fiches individuelles. Une
-- premiere version repliait les 60 000 fiches en un seul jsonb : la
-- construction du tableau depassait 60 s. C'etait le bon signal — la carte se
-- dessine avec des compteurs, pas avec 60 000 points ; les fiches d'un
-- departement se chargent au clic.

create or replace function public.departement_du_cp(cp text)
returns text language sql immutable parallel safe as $$
  select case
    when cp is null then null
    when regexp_replace(cp, '\s', '', 'g') !~ '^[0-9]{5}$' then null
    when left(regexp_replace(cp, '\s', '', 'g'), 2) = '20' then
      case when substring(regexp_replace(cp, '\s', '', 'g') from 3)::int < 200
           then '2A' else '2B' end
    else left(regexp_replace(cp, '\s', '', 'g'), 2)
  end;
$$;

alter table public.entreprises
  add column if not exists departement text
  generated always as (public.departement_du_cp(code_postal)) stored;

create index if not exists entreprises_departement_idx
  on public.entreprises (departement)
  where departement is not null;

/**
 * Les fiches de la carte, statut deja calcule.
 *
 * Reproduit exactement src/lib/carte/statuts.ts : classement par nom d'etape
 * normalise puis repli sur `ordre >= 3`, affaire la plus avancee quand une
 * entreprise en porte plusieurs (aucun < perdu < contact < client), et
 * « masquee » qui prime sur « qualifiee » — c'est un geste humain explicite, et
 * la carte sert justement a retrouver ces fiches-la.
 */
create or replace function public.entreprises_carte()
returns table (
  id bigint, nom text, ville text, code_postal text, telephone text,
  site_web text, tags jsonb, lat double precision, lng double precision,
  dept text, statut text
)
language sql stable security definer set search_path = public as $$
  with avancement as (
    select
      o.entreprise_id,
      max(
        case
          when lower(unaccent(btrim(coalesce(ep.nom, '')))) in ('lost', 'perdu') then 1
          when lower(unaccent(btrim(coalesce(ep.nom, '')))) in ('signature', 'acompte', 'client signe') then 3
          when lower(unaccent(btrim(coalesce(ep.nom, '')))) in ('qualifie', 'lm deploye', 'nouveau lead') then 0
          when lower(unaccent(btrim(coalesce(ep.nom, '')))) = 'en attente' or coalesce(ep.ordre, 0) >= 3 then 2
          else 0
        end
      ) as rang
    from public.opportunites o
    join public.etapes_pipeline ep on ep.id = o.stage_id
    where o.entreprise_id is not null
    group by o.entreprise_id
  )
  select
    e.id,
    coalesce(nullif(btrim(coalesce(e.name, '')), ''), 'Fiche #' || e.id),
    e.ville, e.code_postal, e.telephone, e.site_web_canonique,
    -- `service_tags` d'abord, sinon repli sur `premiers_tags`, le CSV
    -- historique. 1 011 fiches actives ne tiennent leurs tags que de ce repli :
    -- s'en passer les afficherait sans aucun tag sur la carte.
    case
      when jsonb_array_length(coalesce(e.service_tags, '[]'::jsonb)) > 0 then e.service_tags
      else coalesce((
        select jsonb_agg(t)
        from (
          select btrim(x) as t
          from unnest(regexp_split_to_array(coalesce(e.premiers_tags, ''), '[,;|]')) as x
          where btrim(x) <> ''
        ) s
      ), '[]'::jsonb)
    end,
    e.lat, e.lng, e.departement,
    case
      when e.archived_at is not null then 'ecartee'
      when a.rang = 3 then 'client'
      when a.rang = 2 then 'contact'
      when a.rang = 1 then 'ecartee'
      when e.hidden_in_qualification then 'masquee'
      when e.qualifie then 'qualifie'
      else 'prospect'
    end
  from public.entreprises e
  left join avancement a on a.entreprise_id = e.id
  where e.merged_into_id is null;
$$;

/** Ce qui se dessine a l'echelle nationale : compteurs, jamais 60 000 points. */
create or replace function public.entreprises_carte_agregat()
returns jsonb language sql stable security definer set search_path = public as $$
  with base as (select * from public.entreprises_carte())
  select jsonb_build_object(
    'total', (select count(*) from base),
    'hors_carte', (select count(*) from base where dept is null),
    'departements', coalesce((
      select jsonb_agg(jsonb_build_object('dept', dept, 'statut', statut, 'n', n) order by dept, statut)
      from (select dept, statut, count(*) as n from base where dept is not null group by 1, 2) t
    ), '[]'::jsonb),
    -- `densite` porte le departement ET le statut de chaque cellule : l'ecran
    -- colorie ses pastilles par statut et les filtre par departement, un simple
    -- total ne suffirait pas. Une cellule fait un dixieme de degre (~11 km).
    'densite', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lat', lat, 'lng', lng, 'dept', dept, 'statut', statut, 'n', n))
      from (
        select
          round(lat::numeric, 1)::double precision as lat,
          round(lng::numeric, 1)::double precision as lng,
          dept, statut, count(*) as n
        from base
        where lat is not null and lng is not null
        group by 1, 2, 3, 4
      ) g
    ), '[]'::jsonb)
  );
$$;

/** Les fiches d'un seul departement, chargees au clic. */
create or replace function public.entreprises_carte_departement(p_dept text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_agg(to_jsonb(c)) from public.entreprises_carte() c where c.dept = p_dept),
    '[]'::jsonb);
$$;

revoke all on function public.entreprises_carte() from public, anon;
revoke all on function public.entreprises_carte_agregat() from public, anon;
revoke all on function public.entreprises_carte_departement(text) from public, anon;
grant execute on function public.entreprises_carte() to authenticated, service_role;
grant execute on function public.entreprises_carte_agregat() to authenticated, service_role;
grant execute on function public.entreprises_carte_departement(text) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Univers des service tags
-- ───────────────────────────────────────────────────────────────────────────
--
-- `loadServiceTagUniverse` lisait les 60 944 lignes de `entreprises` — 8,3 Mo
-- de `service_tags` — a chaque ouverture de Reglages > Tags et du catalogue du
-- site builder, puis comptait en JS. Or il n'existe que ~280 libelles distincts.
--
-- `n` = nombre de PORTEURS distincts du libelle, pas d'occurrences : l'ecran
-- s'en sert pour annoncer combien de lignes une fusion va modifier.
--
-- La normalisation (cle canonique, taxonomie, exclusions) reste cote JS, dans
-- src/utils/serviceTags.ts, qui en est la seule reference. On renvoie donc des
-- libelles BRUTS, que l'appelant regroupe par `serviceTagKey`. La dupliquer ici
-- aurait cree une seconde source de verite qui aurait derive.
create or replace function public.service_tag_usage()
returns table (source text, tag text, n bigint)
language sql stable security definer set search_path = public as $$
  select 'entreprises'::text, t.tag, count(distinct t.id)
  from (
    select e.id, btrim(x) as tag
    from public.entreprises e,
         lateral (
           select case
             when jsonb_array_length(coalesce(e.service_tags, '[]'::jsonb)) > 0
               then array(select jsonb_array_elements_text(e.service_tags))
             else regexp_split_to_array(coalesce(e.premiers_tags, ''), ',')
           end as tags
         ) src,
         unnest(src.tags) as x
    where e.merged_into_id is null and btrim(x) <> ''
  ) t
  group by t.tag
  union all
  select 'lead_magnets'::text, btrim(x), count(distinct p.id)
  from public.lead_magnet_projects p,
       lateral jsonb_array_elements_text(
         case when jsonb_typeof(p.service_tags_snapshot) = 'array'
              then p.service_tags_snapshot else '[]'::jsonb end) as x
  where btrim(x) <> ''
  group by btrim(x)
  union all
  select 'media'::text, btrim(x), count(distinct m.id)
  from public.media_library m,
       lateral jsonb_array_elements_text(
         case when jsonb_typeof(m.service_tags) = 'array'
              then m.service_tags else '[]'::jsonb end) as x
  where btrim(x) <> ''
  group by btrim(x);
$$;

revoke all on function public.service_tag_usage() from public, anon;
grant execute on function public.service_tag_usage() to authenticated, service_role;
