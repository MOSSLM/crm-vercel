-- L'explorateur d'entreprises : une passe, tous les filtres, les compteurs et la page.
--
-- POURQUOI UNE FONCTION ET PAS DES REQUÊTES POSTGREST. L'écran a besoin de
-- trois choses en même temps sur le MÊME ensemble filtré : le total, les
-- répartitions (les camemberts) et la page courante. PostgREST ne sait pas
-- grouper ; le faire côté Node imposerait de rapatrier 60 000 lignes à chaque
-- changement de case à cocher.
--
-- CE QUE LES COMPTEURS DISENT VRAIMENT. Sur 60 447 fiches vivantes, 401 ont un
-- chiffre d'affaires connu et 1 540 une tranche d'effectif. Filtrer sur un
-- palier de CA ne rend donc presque rien — non parce que les entreprises sont
-- absentes, mais parce que la DONNÉE l'est. D'où le palier `inconnu`, présent
-- dans chaque répartition : l'écran montre le trou au lieu de le cacher.
--
-- L'ÉTAT DU SITE A TROIS VALEURS, PAS DEUX. `present` (une URL canonique, ou un
-- constat qui l'affirme), `absent` (un constat qui dit « on a cherché, il n'y a
-- rien ») et `inconnu` (personne n'a regardé). Un NULL dans `site_web_canonique`
-- ne vaut pas « sans site » : c'est ce que `constats_presence` sert à trancher.
--
-- CE QUE ÇA COÛTE, MESURÉ. Sans aucun filtre — le pire cas, les 60 000 fiches —
-- environ 2,0 s, dont 0,6 s de simple lecture de `entreprises` (61 Mo de heap).
-- Dès qu'un filtre est posé, on retombe autour de 200 ms. L'écran doit donc
-- garder l'affichage précédent pendant qu'il recharge, sans quoi le premier
-- rendu paraît figé.
--
-- QUATRE CHOIX DE FORME, TOUS DICTÉS PAR LA MESURE. Une première version, plus
-- naïve, dépassait DEUX MINUTES sans filtre. Ce qui l'a ramenée à 2 s :
--
--   1. `limit` et `offset` prennent les PARAMÈTRES de la fonction, pas des
--      valeurs lues dans un CTE de réglages. Avec `limit (select … from …)`, le
--      planificateur ignore que la tranche fait vingt-cinq lignes : il planifie
--      la jointure des détails comme si elle en portait 60 000, et bascule sur
--      une boucle imbriquée qui relit le jeu matérialisé à chaque ligne. C'est
--      cette seule ligne qui coûtait les deux minutes.
--   2. `base` ne porte QUE les colonnes qui servent aux compteurs et au tri.
--      Matérialiser quarante colonnes sur 60 000 lignes pour n'en afficher
--      vingt-cinq coûtait plus cher que de rouvrir les tables pour ces
--      vingt-cinq lignes-là (d'où le CTE `details`).
--   3. La tranche emporte ses colonnes dérivées : les relire en rejoignant
--      `base` sur vingt-cinq identifiants ramenait la boucle imbriquée du (1).
--   4. Les huit compteurs booléens tiennent en UN balayage agrégé, et les huit
--      répartitions en un seul `grouping sets`. La version naïve rescannait
--      `base` une fois par compteur — quatorze passes sur 60 000 lignes.
--
-- `work_mem` est relevé sur la fonction (voir le `alter function` en fin de
-- fichier) : le jeu matérialisé et les tris pèsent une douzaine de mégaoctets,
-- et les laisser déborder sur disque coûtait un demi-millier de millisecondes.

-- Convertit un tableau JSON en text[], et NULL pour « pas de filtre » — ce qui
-- distingue « aucune case cochée » (on ne filtre pas) de « tableau vide ».
create or replace function public.explorateur_txt_arr(j jsonb)
returns text[]
language sql
immutable
as $$
  select case
    when jsonb_typeof(j) = 'array' and jsonb_array_length(j) > 0
      then (select array_agg(x) from jsonb_array_elements_text(j) x)
    else null
  end;
$$;

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
    explorateur_txt_arr(p_filtres->'cohortes') as cohortes
),
-- Les tables filles sont minuscules (122 sites, 3 041 constats de site) : on les
-- réduit d'abord, puis on les joint. Un `left join lateral` par ligne coûterait
-- 60 000 sondes d'index pour retrouver les mêmes 122 lignes.
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
-- Un seul balayage pour les huit répartitions. Chaque ligne rendue par
-- `grouping sets` n'a qu'une dimension renseignée, les autres à NULL — et comme
-- les huit colonnes sont garanties non nulles dans `base`, un `is not null`
-- suffit à retrouver la dimension concernée.
repartitions as (
  select etat_site, etat_demo, palier_ca, palier_avis, palier_effectif,
         cohorte, departement, ville, count(*) as n
  from base
  group by grouping sets (
    (etat_site), (etat_demo), (palier_ca), (palier_avis),
    (palier_effectif), (cohorte), (departement), (ville)
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
-- montrer que vingt-cinq.
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
    t.etat_site, t.etat_demo, t.palier_ca, t.palier_avis, t.palier_effectif, t.rge
  from tranche t
  join entreprises e on e.id = t.id
  left join entreprises_donnees_publiques dp on dp.entreprise_id = e.id
  left join opportunites o
    on o.entreprise_id = e.id
   and coalesce(o.is_test, false) = false
   and o.archived_at is null
  left join site_demo sd on sd.enterprise_id = e.id
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
      'owner_id', d.owner_id, 'created_at', d.created_at
    ) order by d.rang)
    from details d
  ), '[]'::jsonb)
);
$fn$;

-- Le jeu matérialisé et les tris pèsent une douzaine de mégaoctets : les
-- laisser déborder sur disque coûtait ~500 ms. Réglage porté par la fonction,
-- donc sans effet sur le reste de la base.
alter function public.explorateur_entreprises(jsonb, integer, integer, text, text) set work_mem = '48MB';

comment on function public.explorateur_entreprises(jsonb, integer, integer, text, text) is
  'Explorateur d''entreprises : rend {total, facettes, lignes} pour un jeu de filtres donné, en une seule construction du jeu filtré.';

revoke all on function public.explorateur_entreprises(jsonb, integer, integer, text, text) from public, anon;
grant execute on function public.explorateur_entreprises(jsonb, integer, integer, text, text) to service_role;

-- Les départements pour le menu déroulant : la liste COMPLÈTE, pas celle de la
-- sélection courante. Un menu qui ne proposerait que les départements déjà
-- retenus interdirait d'en ajouter un — on ne pourrait jamais élargir.
create or replace function public.explorateur_referentiel_departements()
returns table (cle text, libelle text, n bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    e.departement as cle,
    e.departement as libelle,
    count(*) as n
  from entreprises e
  where e.archived_at is null
    and e.merged_into_id is null
    and e.departement is not null
  group by e.departement
  order by e.departement;
$fn$;

revoke all on function public.explorateur_referentiel_departements() from public, anon;
grant execute on function public.explorateur_referentiel_departements() to service_role;
