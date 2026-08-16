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
