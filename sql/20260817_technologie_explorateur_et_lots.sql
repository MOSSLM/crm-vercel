-- ⚠️ CE FICHIER N'EST PLUS LA VERSION EN PLACE DE `explorateur_entreprises`.
-- Le `cross join f` qu'il porte rend les vingt-sept filtres opaques au
-- planificateur : l'estimation s'effondre, les jointures repassent en boucle
-- imbriquée, et la fonction est passée de 2 s à plus de trois minutes.
-- Rejouer ce fichier tel quel RÉINTRODUIT le timeout.
-- La version en service est `sql/20260828_explorateur_sans_cte_de_filtres.sql`.
-- Ce qui suit reste ici pour l'histoire du raisonnement, et pour les objets
-- qu'il crée par ailleurs.

-- Deux ajouts, demandés le 17/08 en suite directe de la détection technique
-- (voir techno.ts) : la voir/trier dans l'explorateur, et pouvoir figer une
-- sélection dans un lot de qualification.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LA TECHNOLOGIE DANS L'EXPLORATEUR
-- ─────────────────────────────────────────────────────────────────────────────
-- `entreprises_audit_site.signaux` porte déjà `cms`, `cmsVersion`, `theme`,
-- `derniereModifDetecteeLe`, `waybackPremiereCaptureLe` — voir
-- src/lib/audit-site/techno.ts. Ce fichier ne fait qu'ouvrir cette colonne à
-- `explorateur_entreprises` : un filtre (`technologies`), une répartition
-- (`facettes.technologie`), un tri (`anciennete`), et les valeurs en colonne.
--
-- MÊME DISCIPLINE DE JOINTURE QUE `entreprises_donnees_publiques` : une table
-- fille jointe sur sa clé primaire (`entreprise_id`), donc un lookup d'index
-- par ligne — pas un balayage de plus sur `entreprises`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LES LOTS
-- ─────────────────────────────────────────────────────────────────────────────
-- La vision du CRM distingue déjà DEUX objets, jamais confondus (voir
-- docs/VISION-crm-segments-et-lots.md) : un SEGMENT est une requête vivante
-- (table `segments_entreprises`, déjà en place), un LOT est une photo figée à
-- l'instant où on la prend. `entreprises.cohorte_demarchage` jouait ce rôle
-- pour DEUX campagnes nommées à l'avance (A_site_faible, B_sans_site), avec une
-- contrainte qui n'accepte que ces deux valeurs — pas un mécanisme pour figer
-- une sélection à la volée depuis l'explorateur, autant de fois qu'on veut.
--
-- D'où une table à part plutôt qu'une troisième valeur forcée dans la
-- contrainte existante : un lot de travail (« WordPress abandonnés — sept
-- 2026 ») n'est pas une cohorte de campagne marketing, et les mélanger aurait
-- rendu `cohorte_demarchage` illisible dans les deux usages.
--
-- Une entreprise peut appartenir à plusieurs lots (table de jonction) : un lot
-- de qualification et une cohorte de campagne ne s'excluent pas.

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Les lots — créés EN PREMIER : `explorateur_entreprises` (section 1,
--    ci-dessous) référence `lots_entreprises` dans son corps, et une fonction
--    `language sql` est analysée à la création, pas seulement au premier
--    appel — la table doit donc déjà exister.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lots (
  id bigserial primary key,
  nom text not null,
  note text,
  cree_le timestamptz not null default now(),
  cree_par uuid references auth.users(id)
);

-- Deux lots du même nom seraient indiscernables dans le menu déroulant — la
-- casse et les espaces de bord ne doivent pas suffire à en faire deux.
create unique index if not exists lots_nom_unique_idx on public.lots (lower(btrim(nom)));

create table if not exists public.lots_entreprises (
  lot_id bigint not null references public.lots(id) on delete cascade,
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,
  ajoute_le timestamptz not null default now(),
  primary key (lot_id, entreprise_id)
);

-- C'est cet index qui rend le filtre `f.lot_id` de l'explorateur un lookup et
-- non un balayage de la table de jonction.
create index if not exists lots_entreprises_entreprise_idx on public.lots_entreprises (entreprise_id);

alter table public.lots enable row level security;
alter table public.lots_entreprises enable row level security;

-- `create policy` n'a pas de `if not exists` : cette garde est ce qui rend le
-- fichier rejouable sans « policy already exists » si un passage précédent
-- s'est arrêté après la création des tables.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'lots' and policyname = 'lots_lecture'
  ) then
    create policy lots_lecture on public.lots for select to authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'lots_entreprises' and policyname = 'lots_entreprises_lecture'
  ) then
    create policy lots_entreprises_lecture on public.lots_entreprises for select to authenticated using (true);
  end if;
end $$;

grant select, insert on public.lots to service_role;
grant select, insert on public.lots_entreprises to service_role;
grant select on public.lots, public.lots_entreprises to authenticated;
grant usage, select on sequence public.lots_id_seq to service_role;

/** Un lot avec sa taille — pour le menu déroulant, sans rouvrir la jonction côté Node à chaque frappe. */
create or replace function public.lots_referentiel()
returns table (id bigint, nom text, taille bigint, cree_le timestamptz)
language sql
stable
security definer
set search_path = public
as $fn$
  select l.id, l.nom, count(le.entreprise_id) as taille, l.cree_le
  from public.lots l
  left join public.lots_entreprises le on le.lot_id = l.id
  group by l.id, l.nom, l.cree_le
  order by l.cree_le desc;
$fn$;

revoke all on function public.lots_referentiel() from public, anon;
grant execute on function public.lots_referentiel() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Technologie : la fonction complète, remplacée
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.explorateur_entreprises(
  p_filtres jsonb default '{}'::jsonb,
  p_page integer default 1,
  p_taille integer default 25,
  p_tri text default 'nom',
  p_sens text default 'asc'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
with f as (
  select
    nullif(btrim(coalesce(p_filtres->>'q','')),'') as q,
    regexp_replace(coalesce(p_filtres->>'q',''),'\D','','g') as q_chiffres,
    nullif(p_filtres->>'qualifie','') as qualifie,
    nullif(p_filtres->>'opportunite','') as opportunite,
    nullif(p_filtres->>'fiche_google','') as fiche_google,
    nullif(p_filtres->>'demarche','') as demarche,
    nullif(p_filtres->>'rge','') as rge,
    nullif(p_filtres->>'email','') as email,
    nullif(p_filtres->>'telephone','') as telephone,
    nullif(p_filtres->>'siret','') as siret,
    nullif(p_filtres->>'logo','') as logo,
    coalesce(nullif(p_filtres->>'masquees',''),'exclure') as masquees,
    coalesce(nullif(p_filtres->>'archivees',''),'exclure') as archivees,
    (p_filtres->>'avis_min')::integer as avis_min,
    (p_filtres->>'avis_max')::integer as avis_max,
    (p_filtres->>'note_min')::numeric as note_min,
    (p_filtres->>'ca_min')::bigint as ca_min,
    (p_filtres->>'ca_max')::bigint as ca_max,
    explorateur_txt_arr(p_filtres->'site') as site,
    explorateur_txt_arr(p_filtres->'demo') as demo,
    explorateur_txt_arr(p_filtres->'ca') as ca,
    explorateur_txt_arr(p_filtres->'effectif') as effectif,
    explorateur_txt_arr(p_filtres->'avis') as avis,
    explorateur_txt_arr(p_filtres->'departements') as departements,
    explorateur_txt_arr(p_filtres->'villes') as villes,
    explorateur_txt_arr(p_filtres->'sources') as sources,
    explorateur_txt_arr(p_filtres->'cohortes') as cohortes,
    -- Nouveau : la techno se filtre comme une source (un tableau de valeurs),
    -- le lot se choisit un par un (un menu, pas des cases).
    explorateur_txt_arr(p_filtres->'technologies') as technologies,
    nullif(p_filtres->>'lot_id','')::bigint as lot_id
),
site_demo as (
  select distinct on (enterprise_id)
    enterprise_id, id, is_published, published_subdomain, published_domain
  from sites
  where enterprise_id is not null
  order by enterprise_id, is_published desc nulls last, updated_at desc nulls last
),
constat_site as (
  select distinct on (entreprise_id) entreprise_id, etat
  from constats_presence
  where sujet = 'site_web'
  order by entreprise_id, constate_le desc nulls last
),
joint as (
  select
    e.id,
    e.qualifie,
    (o.id is not null) as a_opportunite,
    (e.google_place_id is not null) as a_fiche_google,
    (e.premiere_touche_le is not null) as demarchee,
    (e.email is not null) as a_email,
    (e.telephone is not null) as a_telephone,
    coalesce(dp.est_rge_indicatif, false) as rge,
    e.sources,
    coalesce(e.departement, 'inconnu') as departement,
    coalesce(e.ville, 'inconnue') as ville,
    coalesce(e.cohorte_demarchage, 'aucune') as cohorte,
    -- Trois états, jamais deux : voir l'en-tête du fichier.
    case
      when e.site_web_canonique is not null then 'present'
      when cs.etat in ('present','absent') then cs.etat
      else 'inconnu'
    end as etat_site,
    case
      when coalesce(sd.is_published, false) then 'publiee'
      when dm.statut = 'ready' then 'prete'
      when dm.statut = 'framer' then 'framer'
      when dm.statut = 'failed' then 'echec'
      when dm.statut is not null then 'brouillon'
      else 'aucune'
    end as etat_demo,
    case
      when dp.chiffre_affaires is null then 'inconnu'
      when dp.chiffre_affaires < 100000 then 'moins_100k'
      when dp.chiffre_affaires < 500000 then 'de_100k_500k'
      when dp.chiffre_affaires < 1000000 then 'de_500k_1m'
      when dp.chiffre_affaires < 5000000 then 'de_1m_5m'
      else 'plus_5m'
    end as palier_ca,
    case
      when e.nombre_avis is null then 'inconnu'
      when e.nombre_avis = 0 then 'aucun'
      when e.nombre_avis < 10 then 'de_1_9'
      when e.nombre_avis < 50 then 'de_10_49'
      when e.nombre_avis < 200 then 'de_50_199'
      else 'plus_200'
    end as palier_avis,
    coalesce(dp.tranche_effectif_code, 'inconnu') as palier_effectif,
    -- Nouveau : un CMS non reconnu (ou jamais analysé) vaut 'inconnu', comme
    -- les autres paliers — jamais NULL, sinon la case ne s'affiche pas et ne
    -- se coche pas.
    coalesce(eas.signaux->>'cms', 'inconnu') as cms,
    -- Les deux clés de tri, calculées une fois ici plutôt qu'à chaque
    -- comparaison. Le tri porte sur l'une OU l'autre, jamais les deux : celle
    -- qui ne sert pas vaut NULL et se range en fin de liste sans effet.
    case coalesce(nullif(p_tri,''),'nom')
      when 'nom' then lower(coalesce(e.name,''))
      when 'ville' then lower(coalesce(e.ville,''))
    end as k_txt,
    case coalesce(nullif(p_tri,''),'nom')
      when 'avis' then coalesce(e.nombre_avis,-1)::numeric
      when 'note' then coalesce(e.note_moyenne,-1)
      when 'ca' then coalesce(dp.chiffre_affaires,-1)::numeric
      when 'recent' then extract(epoch from e.created_at)
      when 'touche' then extract(epoch from e.premiere_touche_le)
      -- Ascendant = le plus ancien d'abord : c'est l'ordre utile pour
      -- prioriser. Un site jamais analysé (date inconnue) vaut NULL et se
      -- range en fin de liste, comme 'ca'/'note'/'recent'/'touche' — « on ne
      -- sait pas » n'est pas « le plus ancien ».
      when 'anciennete' then extract(epoch from nullif(eas.signaux->>'derniereModifDetecteeLe','')::timestamptz)
    end as k_num
  from entreprises e
  cross join f
  left join entreprises_donnees_publiques dp on dp.entreprise_id = e.id
  left join opportunites o
    on o.entreprise_id = e.id
   and coalesce(o.is_test, false) = false
   and o.archived_at is null
  left join lead_magnet_projects dm on dm.entreprise_id = e.id
  left join site_demo sd on sd.enterprise_id = e.id
  left join constat_site cs on cs.entreprise_id = e.id
  left join entreprises_audit_site eas on eas.entreprise_id = e.id
  where e.merged_into_id is null
    and case f.archivees
          when 'inclure' then true
          when 'seulement' then e.archived_at is not null
          else e.archived_at is null
        end
    and case f.masquees
          when 'inclure' then true
          when 'seulement' then coalesce(e.hidden_in_qualification, false)
          else coalesce(e.hidden_in_qualification, false) = false
        end
    and (f.q is null or (
          e.name ilike '%'||f.q||'%'
       or e.ville ilike '%'||f.q||'%'
       or e.code_postal like f.q||'%'
       or e.email ilike '%'||f.q||'%'
       or e.domaine_canonique ilike '%'||f.q||'%'
       or (f.q_chiffres <> '' and e.siret = f.q_chiffres)
       or (f.q_chiffres <> '' and e.siren = f.q_chiffres)
       -- Quatre chiffres au moins : en deçà, un `like '%12%'` ramènerait la
       -- moitié de la base sous prétexte de recherche par téléphone.
       or (length(f.q_chiffres) >= 4 and e.telephone_chiffres like '%'||f.q_chiffres||'%')))
    and (f.qualifie is null or e.qualifie = (f.qualifie = 'oui'))
    and (f.opportunite is null or (o.id is not null) = (f.opportunite = 'oui'))
    and (f.fiche_google is null or (e.google_place_id is not null) = (f.fiche_google = 'oui'))
    and (f.demarche is null or (e.premiere_touche_le is not null) = (f.demarche = 'oui'))
    and (f.email is null or (e.email is not null) = (f.email = 'oui'))
    and (f.telephone is null or (e.telephone is not null) = (f.telephone = 'oui'))
    and (f.siret is null or (e.siret is not null) = (f.siret = 'oui'))
    and (f.logo is null or (e.logo_url is not null) = (f.logo = 'oui'))
    and (f.rge is null or coalesce(dp.est_rge_indicatif, false) = (f.rge = 'oui'))
    and (f.avis_min is null or coalesce(e.nombre_avis, 0) >= f.avis_min)
    and (f.avis_max is null or coalesce(e.nombre_avis, 0) <= f.avis_max)
    and (f.note_min is null or e.note_moyenne >= f.note_min)
    and (f.ca_min is null or dp.chiffre_affaires >= f.ca_min)
    and (f.ca_max is null or dp.chiffre_affaires <= f.ca_max)
    and (f.departements is null or e.departement = any(f.departements))
    and (f.villes is null or e.ville = any(f.villes))
    and (f.cohortes is null or e.cohorte_demarchage = any(f.cohortes))
    and (f.sources is null or e.sources && f.sources)
    -- Un lot est une simple appartenance, pas une dimension à répartir en
    -- camembert : on choisit UN lot à la fois (menu), pas plusieurs à
    -- intersecter. D'où un `exists` direct ici plutôt qu'un filtre en `base`.
    and (f.lot_id is null or exists (
          select 1 from lots_entreprises le
          where le.entreprise_id = e.id and le.lot_id = f.lot_id
        ))
),
-- Deuxième étage : les filtres qui portent sur les colonnes DÉRIVÉES ci-dessus
-- (un alias de SELECT n'est pas visible dans son propre WHERE). `materialized`
-- garantit que le jeu filtré n'est construit qu'une fois pour les cinq usages
-- qui suivent.
base as materialized (
  select j.* from joint j cross join f
  where (f.site is null or j.etat_site = any(f.site))
    and (f.demo is null or j.etat_demo = any(f.demo))
    and (f.ca is null or j.palier_ca = any(f.ca))
    and (f.effectif is null or j.palier_effectif = any(f.effectif))
    and (f.avis is null or j.palier_avis = any(f.avis))
    and (f.technologies is null or j.cms = any(f.technologies))
),
-- Un seul balayage pour le total et les huit compteurs binaires.
compteurs as (
  select
    count(*) as total,
    count(*) filter (where qualifie) as qualifiee,
    count(*) filter (where not qualifie) as non_qualifiee,
    count(*) filter (where a_opportunite) as opp_avec,
    count(*) filter (where not a_opportunite) as opp_sans,
    count(*) filter (where a_fiche_google) as google_avec,
    count(*) filter (where not a_fiche_google) as google_sans,
    count(*) filter (where demarchee) as demarchee,
    count(*) filter (where not demarchee) as jamais_demarchee,
    count(*) filter (where a_email) as a_email,
    count(*) filter (where a_telephone) as a_telephone,
    count(*) filter (where not a_email and not a_telephone) as sans_contact,
    count(*) filter (where rge) as rge_oui,
    count(*) filter (where not rge) as rge_non
  from base
),
-- Un seul balayage pour les neuf répartitions. Chaque ligne rendue par
-- `grouping sets` n'a qu'une dimension renseignée, les autres à NULL — et comme
-- les neuf colonnes sont garanties non nulles dans `base`, un `is not null`
-- suffit à retrouver la dimension concernée.
repartitions as (
  select etat_site, etat_demo, palier_ca, palier_avis, palier_effectif,
         cohorte, departement, ville, cms, count(*) as n
  from base
  group by grouping sets (
    (etat_site), (etat_demo), (palier_ca), (palier_avis),
    (palier_effectif), (cohorte), (departement), (ville), (cms)
  )
),
par_source as (
  select s, count(*) as n
  from base, unnest(coalesce(sources, '{}'::text[])) s
  group by s
),
-- `limit`/`offset` prennent les paramètres de la fonction : c'est ce qui permet
-- au planificateur de savoir que la tranche est petite (cf. point 1 en tête de
-- fichier). La tranche emporte aussi ses colonnes dérivées, pour ne pas avoir à
-- rejoindre `base` ensuite.
tranche as (
  select b.*, row_number() over () as rang
  from (
    select b.id, b.etat_site, b.etat_demo, b.palier_ca, b.palier_avis,
           b.palier_effectif, b.rge
    from base b
    order by
      case when lower(coalesce(p_sens,'asc')) <> 'desc' then b.k_txt end asc nulls last,
      case when lower(coalesce(p_sens,'asc')) = 'desc' then b.k_txt end desc nulls last,
      case when lower(coalesce(p_sens,'asc')) <> 'desc' then b.k_num end asc nulls last,
      case when lower(coalesce(p_sens,'asc')) = 'desc' then b.k_num end desc nulls last,
      b.id
    limit least(greatest(coalesce(p_taille,25),1),200)
    offset (greatest(coalesce(p_page,1),1) - 1) * least(greatest(coalesce(p_taille,25),1),200)
  ) b
),
-- On rouvre les tables pour les seules lignes affichées. Porter ces quarante
-- colonnes dans `base` reviendrait à les matérialiser 60 000 fois pour n'en
-- montrer que vingt-cinq. `entreprises_audit_site` suit la même règle : ses
-- champs techniques ne sont lus qu'ici, jamais dans `base`.
details as (
  select
    t.rang, e.id, e.name, e.ville, e.code_postal, e.departement, e.adresse,
    e.telephone, e.email, e.site_web_canonique, e.domaine_canonique,
    e.google_place_id, e.google_maps_url, e.note_moyenne, e.nombre_avis,
    e.qualifie, e.siret, e.sources, e.premiers_tags, e.logo_url,
    e.premiere_touche_le, e.cohorte_demarchage, e.created_at, e.owner_id,
    coalesce(e.hidden_in_qualification, false) as masquee,
    (e.archived_at is not null) as archivee,
    dp.chiffre_affaires, dp.exercice_annee, dp.tranche_effectif_code,
    dp.categorie_entreprise, dp.date_creation,
    o.id as opportunite_id, o.stage_id, o.montant as opportunite_montant,
    sd.id as site_demo_id, sd.published_subdomain, sd.published_domain,
    t.etat_site, t.etat_demo, t.palier_ca, t.palier_avis, t.palier_effectif, t.rge,
    eas.signaux->>'cms' as cms,
    eas.signaux->>'cmsVersion' as cms_version,
    eas.signaux->>'theme' as theme_wp,
    eas.signaux->>'derniereModifDetecteeLe' as derniere_modif_site,
    eas.signaux->>'waybackPremiereCaptureLe' as en_ligne_depuis
  from tranche t
  join entreprises e on e.id = t.id
  left join entreprises_donnees_publiques dp on dp.entreprise_id = e.id
  left join opportunites o
    on o.entreprise_id = e.id
   and coalesce(o.is_test, false) = false
   and o.archived_at is null
  left join site_demo sd on sd.enterprise_id = e.id
  left join entreprises_audit_site eas on eas.entreprise_id = e.id
)
select jsonb_build_object(
  'total', (select total from compteurs),
  'page', greatest(coalesce(p_page,1),1),
  'taille', least(greatest(coalesce(p_taille,25),1),200),
  'tri', coalesce(nullif(p_tri,''),'nom'),
  'sens', case when lower(coalesce(p_sens,'asc')) = 'desc' then 'desc' else 'asc' end,
  'facettes', jsonb_build_object(
    'qualification', (select jsonb_build_object('qualifiee',qualifiee,'non_qualifiee',non_qualifiee) from compteurs),
    'opportunite', (select jsonb_build_object('avec',opp_avec,'sans',opp_sans) from compteurs),
    'fiche_google', (select jsonb_build_object('avec',google_avec,'sans',google_sans) from compteurs),
    'demarchage', (select jsonb_build_object('demarchee',demarchee,'jamais',jamais_demarchee) from compteurs),
    'contact', (select jsonb_build_object('email',a_email,'telephone',a_telephone,'aucun',sans_contact) from compteurs),
    'rge', (select jsonb_build_object('oui',rge_oui,'non',rge_non) from compteurs),
    'site', coalesce((select jsonb_object_agg(etat_site,n) from repartitions where etat_site is not null), '{}'::jsonb),
    'demo', coalesce((select jsonb_object_agg(etat_demo,n) from repartitions where etat_demo is not null), '{}'::jsonb),
    'ca', coalesce((select jsonb_object_agg(palier_ca,n) from repartitions where palier_ca is not null), '{}'::jsonb),
    'avis', coalesce((select jsonb_object_agg(palier_avis,n) from repartitions where palier_avis is not null), '{}'::jsonb),
    'effectif', coalesce((select jsonb_object_agg(palier_effectif,n) from repartitions where palier_effectif is not null), '{}'::jsonb),
    'cohorte', coalesce((select jsonb_object_agg(cohorte,n) from repartitions where cohorte is not null), '{}'::jsonb),
    'sources', coalesce((select jsonb_object_agg(s,n) from par_source), '{}'::jsonb),
    'technologie', coalesce((select jsonb_object_agg(cms,n) from repartitions where cms is not null), '{}'::jsonb),
    -- Les deux seules répartitions plafonnées : 97 départements et 19 239
    -- villes ne tiennent pas dans un graphe. Le reste est rendu en entier.
    'departements', coalesce((select jsonb_agg(jsonb_build_object('cle',cle,'n',n) order by n desc, cle)
      from (select departement as cle, n from repartitions
            where departement is not null order by n desc, departement limit 15) t), '[]'::jsonb),
    'villes', coalesce((select jsonb_agg(jsonb_build_object('cle',cle,'n',n) order by n desc, cle)
      from (select ville as cle, n from repartitions
            where ville is not null order by n desc, ville limit 15) t), '[]'::jsonb)
  ),
  'lignes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nom', d.name, 'ville', d.ville, 'code_postal', d.code_postal,
      'departement', d.departement, 'adresse', d.adresse, 'telephone', d.telephone,
      'email', d.email, 'site', d.site_web_canonique, 'domaine', d.domaine_canonique,
      'logo_url', d.logo_url, 'google_place_id', d.google_place_id,
      'google_maps_url', d.google_maps_url, 'note_moyenne', d.note_moyenne,
      'nombre_avis', d.nombre_avis, 'qualifie', d.qualifie, 'masquee', d.masquee,
      'archivee', d.archivee, 'siret', d.siret,
      'sources', to_jsonb(coalesce(d.sources,'{}'::text[])), 'metier', d.premiers_tags,
      'etat_site', d.etat_site, 'etat_demo', d.etat_demo, 'palier_ca', d.palier_ca,
      'palier_avis', d.palier_avis, 'palier_effectif', d.palier_effectif,
      'chiffre_affaires', d.chiffre_affaires, 'exercice_annee', d.exercice_annee,
      'tranche_effectif_code', d.tranche_effectif_code,
      'categorie_entreprise', d.categorie_entreprise, 'date_creation', d.date_creation,
      'rge', d.rge, 'opportunite_id', d.opportunite_id, 'stage_id', d.stage_id,
      'opportunite_montant', d.opportunite_montant, 'site_demo_id', d.site_demo_id,
      'demo_sous_domaine', d.published_subdomain, 'demo_domaine', d.published_domain,
      'premiere_touche_le', d.premiere_touche_le, 'cohorte', d.cohorte_demarchage,
      'owner_id', d.owner_id, 'created_at', d.created_at,
      'cms', d.cms, 'cms_version', d.cms_version, 'theme', d.theme_wp,
      'derniere_modif_site', d.derniere_modif_site, 'en_ligne_depuis', d.en_ligne_depuis
    ) order by d.rang)
    from details d
  ), '[]'::jsonb)
);
$fn$;

alter function public.explorateur_entreprises(jsonb, integer, integer, text, text) set work_mem = '48MB';

comment on function public.explorateur_entreprises(jsonb, integer, integer, text, text) is
  'Explorateur d''entreprises : rend {total, facettes, lignes} pour un jeu de filtres donné, en une seule construction du jeu filtré.';

revoke all on function public.explorateur_entreprises(jsonb, integer, integer, text, text) from public, anon;
grant execute on function public.explorateur_entreprises(jsonb, integer, integer, text, text) to service_role;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles
-- ─────────────────────────────────────────────────────────────────────────────
-- select jsonb_pretty(explorateur_entreprises('{"technologies":["wordpress"]}'::jsonb, 1, 5, 'anciennete', 'asc'));
-- select * from lots_referentiel();
