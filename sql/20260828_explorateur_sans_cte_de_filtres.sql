-- L'explorateur : sortir les filtres du CTE, pour rendre le plan estimable.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUI S'EST PASSÉ, ET POURQUOI CE N'ÉTAIT PAS UNE LENTEUR
-- ─────────────────────────────────────────────────────────────────────────────
-- `explorateur_entreprises` lisait ses vingt-sept filtres dans un CTE `f` d'une
-- ligne, croisé avec `entreprises`. Pour le planificateur, `f.qualifie` n'est
-- pas une valeur : c'est une colonne opaque. Il ne peut estimer AUCUN des
-- vingt-sept prédicats, leur applique une sélectivité par défaut — et ces
-- défauts se multiplient.
--
-- Mesuré le 28/08/2026 sur une reproduction volontairement réduite (CINQ
-- filtres au lieu de vingt-sept) : l'estimation tombe déjà à 69 lignes là où il
-- y en a 60 078. Un facteur 870. À 69 lignes attendues, une boucle imbriquée
-- avec sonde d'index est le bon plan ; à 60 078, ce sont soixante mille sondes
-- dans `entreprises_donnees_publiques` et `entreprises_audit_site`, plus la
-- relecture des sous-requêtes filles à chaque ligne.
--
--   · un appel complet, relevé dans pg_stat_statements ..... 199 s
--   · le seul CTE `base`, reproduit à l'identique .......... > 55 s (annulé)
--   · la MÊME requête, prédicats écrits en clair ........... 2,3 s
--   · les six jointures seules, sans le CTE `f` ............ 1,5 s
--   · APRÈS cette migration, le même appel complet .........  0,5 s
--
-- L'EN-TÊTE DE `20260817_explorateur_entreprises.sql` DÉCRIT DÉJÀ CE PIÈGE,
-- mais pour le seul `limit` : « le planificateur ignore que la tranche fait
-- vingt-cinq lignes ». La correction avait été appliquée là, pas au reste. Le
-- `cross join f` fait exactement la même chose aux vingt-sept filtres — et
-- chaque filtre ajouté depuis dégrade l'estimation un peu plus, en silence.
-- Ajouter la technologie et les lots le 17/08 a ajouté deux prédicats opaques
-- et une septième jointure : c'est ce qui a fini de faire basculer le plan.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA FORME RETENUE : ON N'ÉMET QUE LES PRÉDICATS DEMANDÉS
-- ─────────────────────────────────────────────────────────────────────────────
-- Le SQL est assemblé en plpgsql, chaque valeur passée en LITTÉRAL. Trois
-- effets, dont deux étaient invisibles avant de mesurer :
--
--   1. Le planificateur retrouve des estimations justes : hachage au lieu de
--      boucle imbriquée, et un filtre posé devient PLUS rapide qu'aujourd'hui
--      au lieu d'être noyé dans le même plan générique.
--   2. Les vingt-sept clauses « toujours vraies » disparaissent du plan au lieu
--      d'être évaluées 60 000 fois chacune.
--   3. Le tri n'est plus un `case` par ligne : une seule des deux clés est
--      calculée, l'autre est un `null` constant.
--
-- Résultat mesuré : 0,5 s sans aucun filtre en régime établi, 41 à 280 ms dès
-- qu'un filtre est posé. Sous la barre des 2,0 s que la version d'origine
-- revendiquait — et cette fois le chiffre est daté et rejouable (voir CONTRÔLE
-- en fin de fichier).
--
-- POURQUOI L'ASSEMBLAGE EST DANS UNE FONCTION À PART. `explorateur_base_sql`
-- rend le texte de la relation filtrée, et rien d'autre. C'est elle qui sera
-- appelée pour FIGER UN LOT depuis l'explorateur : figer et afficher doivent
-- sortir du même code, sinon le lot ne contient pas ce que l'humain a vu — et
-- c'est précisément le mensonge que `figer_lot_depuis_criteres` refuse déjà de
-- commettre sur les critères qu'il ne sait pas trancher.
--
-- L'INJECTION EST FERMÉE PAR CONSTRUCTION : toute valeur venue du JSON passe
-- soit par `quote_literal`, soit par un cast numérique avant d'être écrite.
-- Aucune clé du JSON n'atteint le SQL — seules les VALEURS le font, et les noms
-- de colonnes sont écrits en dur ici.
--
-- ⚠️ NE PAS « CORRIGER » LE search_path DE host_est_generique, host_key NI
-- chercher_entreprises AU PASSAGE. Les advisors Supabase les signalent en
-- `function_search_path_mutable`, et l'épinglage ferait décrocher
-- `entreprises_sans_site_idx` en silence (351 ms → 6 461 ms). Voir CLAUDE.md.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. L'assemblage du prédicat — le morceau partagé
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.explorateur_base_sql(
  p_filtres jsonb default '{}'::jsonb,
  p_tri text default 'nom'
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  -- Deux étages, comme avant : `amont` porte sur les colonnes des tables,
  -- `aval` sur les colonnes DÉRIVÉES (un alias de select n'est pas visible dans
  -- son propre where). C'est la seule raison de la sous-requête imbriquée.
  amont text[] := '{}';
  aval  text[] := '{}';
  ou    text[];
  s     text;
  a     text[];
  chiffres text;
  tri   text := coalesce(nullif(p_tri, ''), 'nom');
  -- Une seule des deux clés est calculée ; celle qui ne sert pas est un `null`
  -- constant et se range en fin de liste sans effet.
  k_txt text := 'null::text';
  k_num text := 'null::numeric';
begin
  ------------------------------------------------------------------ l'état
  amont := amont || 'e.merged_into_id is null'::text;

  s := coalesce(nullif(p_filtres->>'archivees', ''), 'exclure');
  if s = 'seulement' then
    amont := amont || 'e.archived_at is not null'::text;
  elsif s <> 'inclure' then
    amont := amont || 'e.archived_at is null'::text;
  end if;

  -- `x is true` / `x is not true` PLUTÔT QUE `coalesce(x, false)`, et ce n'est
  -- pas cosmétique : les deux écritures sont strictement équivalentes sur les
  -- trois valeurs d'un booléen, mais le planificateur ne sait pas estimer un
  -- `coalesce` — il lui applique 0,5 — alors qu'il lit les statistiques de la
  -- colonne sous un test booléen. C'est ce seul `coalesce` qui faisait annoncer
  -- 30 080 fiches vivantes au lieu de 60 078.
  s := coalesce(nullif(p_filtres->>'masquees', ''), 'exclure');
  if s = 'seulement' then
    amont := amont || 'e.hidden_in_qualification is true'::text;
  elsif s <> 'inclure' then
    amont := amont || 'e.hidden_in_qualification is not true'::text;
  end if;

  ------------------------------------------------------------- la recherche
  s := nullif(btrim(coalesce(p_filtres->>'q', '')), '');
  if s is not null then
    chiffres := regexp_replace(s, '\D', '', 'g');
    ou := array[
      'e.name ilike ' || quote_literal('%' || s || '%'),
      'e.ville ilike ' || quote_literal('%' || s || '%'),
      'e.code_postal like ' || quote_literal(s || '%'),
      'e.email ilike ' || quote_literal('%' || s || '%'),
      'e.domaine_canonique ilike ' || quote_literal('%' || s || '%')
    ];
    if chiffres <> '' then
      ou := ou || ('e.siret = ' || quote_literal(chiffres));
      ou := ou || ('e.siren = ' || quote_literal(chiffres));
    end if;
    -- Quatre chiffres au moins : en deçà, un `like '%12%'` ramènerait la moitié
    -- de la base sous prétexte de recherche par téléphone.
    if length(chiffres) >= 4 then
      ou := ou || ('e.telephone_chiffres like ' || quote_literal('%' || chiffres || '%'));
    end if;
    amont := amont || ('(' || array_to_string(ou, ' or ') || ')');
  end if;

  --------------------------------------------------------------- les oui/non
  -- Écrits un par un plutôt que par une boucle sur une table de correspondance :
  -- « non » ne se dit pas de la même façon pour un booléen (`= false`, qui
  -- exclut les NULL) et pour une présence (`is null`, qui les inclut). Une
  -- boucle les aurait confondus.
  s := nullif(p_filtres->>'qualifie', '');
  if s in ('oui', 'non') then amont := amont || ('e.qualifie = ' || (s = 'oui')::text); end if;

  s := nullif(p_filtres->>'opportunite', '');
  if s = 'oui' then amont := amont || 'o.id is not null'::text;
  elsif s = 'non' then amont := amont || 'o.id is null'::text; end if;

  s := nullif(p_filtres->>'fiche_google', '');
  if s = 'oui' then amont := amont || 'e.google_place_id is not null'::text;
  elsif s = 'non' then amont := amont || 'e.google_place_id is null'::text; end if;

  s := nullif(p_filtres->>'demarche', '');
  if s = 'oui' then amont := amont || 'e.premiere_touche_le is not null'::text;
  elsif s = 'non' then amont := amont || 'e.premiere_touche_le is null'::text; end if;

  s := nullif(p_filtres->>'email', '');
  if s = 'oui' then amont := amont || 'e.email is not null'::text;
  elsif s = 'non' then amont := amont || 'e.email is null'::text; end if;

  s := nullif(p_filtres->>'telephone', '');
  if s = 'oui' then amont := amont || 'e.telephone is not null'::text;
  elsif s = 'non' then amont := amont || 'e.telephone is null'::text; end if;

  s := nullif(p_filtres->>'siret', '');
  if s = 'oui' then amont := amont || 'e.siret is not null'::text;
  elsif s = 'non' then amont := amont || 'e.siret is null'::text; end if;

  s := nullif(p_filtres->>'logo', '');
  if s = 'oui' then amont := amont || 'e.logo_url is not null'::text;
  elsif s = 'non' then amont := amont || 'e.logo_url is null'::text; end if;

  s := nullif(p_filtres->>'rge', '');
  if s in ('oui', 'non') then
    amont := amont || ('dp.est_rge_indicatif is ' || case when s = 'oui' then 'true' else 'not true' end);
  end if;

  ------------------------------------------------------------- les intervalles
  -- Le cast est la fermeture : un texte qui n'est pas un nombre lève ici, et
  -- rien d'autre que des chiffres n'atteint le SQL.
  if nullif(p_filtres->>'avis_min', '') is not null then
    amont := amont || ('coalesce(e.nombre_avis, 0) >= ' || (p_filtres->>'avis_min')::integer::text);
  end if;
  if nullif(p_filtres->>'avis_max', '') is not null then
    amont := amont || ('coalesce(e.nombre_avis, 0) <= ' || (p_filtres->>'avis_max')::integer::text);
  end if;
  if nullif(p_filtres->>'note_min', '') is not null then
    amont := amont || ('e.note_moyenne >= ' || (p_filtres->>'note_min')::numeric::text);
  end if;
  if nullif(p_filtres->>'ca_min', '') is not null then
    amont := amont || ('dp.chiffre_affaires >= ' || (p_filtres->>'ca_min')::bigint::text);
  end if;
  if nullif(p_filtres->>'ca_max', '') is not null then
    amont := amont || ('dp.chiffre_affaires <= ' || (p_filtres->>'ca_max')::bigint::text);
  end if;

  ------------------------------------------------------------------ les listes
  -- `a::text` rend le littéral d'un tableau, dont `array_out` échappe déjà le
  -- contenu ; `quote_literal` ferme le tout.
  a := explorateur_txt_arr(p_filtres->'departements');
  if a is not null then amont := amont || ('e.departement = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'villes');
  if a is not null then amont := amont || ('e.ville = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'cohortes');
  if a is not null then amont := amont || ('e.cohorte_demarchage = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'sources');
  if a is not null then amont := amont || ('e.sources && ' || quote_literal(a::text) || '::text[]'); end if;

  -- Un lot est une appartenance, pas une dimension à répartir en camembert : on
  -- en choisit UN à la fois, d'où un `exists` et non une liste.
  if nullif(p_filtres->>'lot_id', '') is not null then
    amont := amont || (
      'exists (select 1 from lots_entreprises le where le.entreprise_id = e.id and le.lot_id = '
      || (p_filtres->>'lot_id')::bigint::text || ')'
    );
  end if;

  ------------------------------------------------- les filtres sur les dérivées
  a := explorateur_txt_arr(p_filtres->'site');
  if a is not null then aval := aval || ('j.etat_site = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'demo');
  if a is not null then aval := aval || ('j.etat_demo = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'ca');
  if a is not null then aval := aval || ('j.palier_ca = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'effectif');
  if a is not null then aval := aval || ('j.palier_effectif = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'avis');
  if a is not null then aval := aval || ('j.palier_avis = any(' || quote_literal(a::text) || '::text[])'); end if;

  a := explorateur_txt_arr(p_filtres->'technologies');
  if a is not null then aval := aval || ('j.cms = any(' || quote_literal(a::text) || '::text[])'); end if;

  ---------------------------------------------------------------------- le tri
  case tri
    when 'ville'      then k_txt := 'lower(coalesce(e.ville, ''''))';
    when 'avis'       then k_num := 'coalesce(e.nombre_avis, -1)::numeric';
    when 'note'       then k_num := 'coalesce(e.note_moyenne, -1)';
    when 'ca'         then k_num := 'coalesce(dp.chiffre_affaires, -1)::numeric';
    when 'recent'     then k_num := 'extract(epoch from e.created_at)';
    when 'touche'     then k_num := 'extract(epoch from e.premiere_touche_le)';
    -- Ascendant = le plus ancien d'abord. Un site jamais analysé vaut NULL et se
    -- range en fin de liste : « on ne sait pas » n'est pas « le plus ancien ».
    when 'anciennete' then k_num := 'extract(epoch from nullif(eas.signaux->>''derniereModifDetecteeLe'', '''')::timestamptz)';
    else                   k_txt := 'lower(coalesce(e.name, ''''))';
  end case;

  ------------------------------------------------------------------- le rendu
  -- `format` n'interprète le pour-cent que dans le GABARIT ; les motifs `ilike`
  -- des arguments n'ont donc rien à échapper. Le gabarit, lui, n'en porte aucun.
  --
  -- Les deux tables filles minuscules (321 sites, 3 363 constats) sont réduites
  -- dans une sous-requête puis jointes : un `left join lateral` coûterait
  -- 60 000 sondes pour retrouver les mêmes 314 lignes.
  return format($sql$
select * from (
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
    coalesce(eas.signaux->>'cms', 'inconnu') as cms,
    %s as k_txt,
    %s as k_num
  from entreprises e
  left join entreprises_donnees_publiques dp on dp.entreprise_id = e.id
  left join opportunites o
    on o.entreprise_id = e.id
   and coalesce(o.is_test, false) = false
   and o.archived_at is null
  left join lead_magnet_projects dm on dm.entreprise_id = e.id
  left join (
    select distinct on (enterprise_id) enterprise_id, is_published
    from sites
    where enterprise_id is not null
    order by enterprise_id, is_published desc nulls last, updated_at desc nulls last
  ) sd on sd.enterprise_id = e.id
  left join (
    select distinct on (entreprise_id) entreprise_id, etat
    from constats_presence
    where sujet = 'site_web'
    order by entreprise_id, constate_le desc nulls last
  ) cs on cs.entreprise_id = e.id
  left join entreprises_audit_site eas on eas.entreprise_id = e.id
  where %s
) j
where %s
$sql$,
    k_txt,
    k_num,
    array_to_string(amont, ' and '),
    coalesce(nullif(array_to_string(aval, ' and '), ''), 'true')
  );
end;
$fn$;

comment on function public.explorateur_base_sql(jsonb, text) is
  'Rend le TEXTE SQL de la population filtrée de l''explorateur. Partagé entre l''affichage et le figeage d''un lot : les deux doivent désigner exactement le même ensemble.';

revoke all on function public.explorateur_base_sql(jsonb, text) from public, anon;
grant execute on function public.explorateur_base_sql(jsonb, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. L'explorateur, réécrit autour de ce prédicat
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le corps ne change pas de FORME : `base` matérialisé une fois, un balayage
-- pour les compteurs, un `grouping sets` pour les neuf répartitions, une
-- tranche, et les détails relus pour les seules lignes affichées. Ce qui change
-- est que le planificateur voit enfin ce qu'il manipule.
--
-- `limit` et `offset` sont désormais des CONSTANTES du texte, ce que le
-- commentaire d'origine cherchait à obtenir en passant par les paramètres de la
-- fonction — sans y parvenir, puisqu'un paramètre reste opaque au moment du
-- plan générique.

create or replace function public.explorateur_entreprises(
  p_filtres jsonb default '{}'::jsonb,
  p_page integer default 1,
  p_taille integer default 25,
  p_tri text default 'nom',
  p_sens text default 'asc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set work_mem = '48MB'
as $fn$
declare
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 200);
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_tri    text    := coalesce(nullif(p_tri, ''), 'nom');
  v_sens   text    := case when lower(coalesce(p_sens, 'asc')) = 'desc' then 'desc' else 'asc' end;
  v_ordre  text;
  resultat jsonb;
begin
  -- Le tri porte sur l'une OU l'autre clé, jamais les deux : celle qui ne sert
  -- pas vaut NULL et se range en fin de liste. `id` ferme l'ordre, sans quoi
  -- deux pages successives pourraient montrer la même fiche.
  v_ordre := 'k_txt ' || v_sens || ' nulls last, k_num ' || v_sens || ' nulls last, id';

  execute format($sql$
with base as materialized ( %s ),
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
tranche as (
  select b.*, row_number() over () as rang
  from (
    select b.id, b.etat_site, b.etat_demo, b.palier_ca, b.palier_avis,
           b.palier_effectif, b.rge
    from base b
    order by %s
    limit %s offset %s
  ) b
),
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
  left join (
    select distinct on (enterprise_id) enterprise_id, id, published_subdomain, published_domain
    from sites
    where enterprise_id is not null
    order by enterprise_id, is_published desc nulls last, updated_at desc nulls last
  ) sd on sd.enterprise_id = e.id
  left join entreprises_audit_site eas on eas.entreprise_id = e.id
)
select jsonb_build_object(
  'total', (select total from compteurs),
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
)
$sql$,
    explorateur_base_sql(p_filtres, v_tri),
    v_ordre,
    v_taille::text,
    ((v_page - 1) * v_taille)::text
  )
  into resultat;

  -- L'écho de la demande est posé ici et pas dans le SQL : ce sont les valeurs
  -- déjà bornées ci-dessus, et les recalculer dans le gabarit ferait deux
  -- endroits où le plafond de 200 devrait rester d'accord avec lui-même.
  return resultat || jsonb_build_object(
    'page', v_page,
    'taille', v_taille,
    'tri', v_tri,
    'sens', v_sens
  );
end;
$fn$;

comment on function public.explorateur_entreprises(jsonb, integer, integer, text, text) is
  'Explorateur d''entreprises : rend {total, facettes, lignes} pour un jeu de filtres donné. Le SQL est assemblé pour n''émettre que les prédicats demandés — un filtre lu dans un CTE est opaque au planificateur, et vingt-sept l''étaient.';

revoke all on function public.explorateur_entreprises(jsonb, integer, integer, text, text) from public, anon;
grant execute on function public.explorateur_entreprises(jsonb, integer, integer, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Les statistiques — l'aggravant secondaire
-- ═══════════════════════════════════════════════════════════════════════════
-- `entreprises` n'avait pas été analysée depuis onze jours : le planificateur
-- attendait 30 080 lignes vivantes là où il y en a 60 078. Une erreur de
-- facteur deux ne suffit pas à faire basculer un plan, mais elle s'ajoute à
-- celle des prédicats opaques. La table grossit par versements de plusieurs
-- milliers de fiches : le seuil par défaut (10 % de la table, soit ~6 000
-- lignes) laisse la dérive s'installer entre deux passages.
analyze public.entreprises;
analyze public.entreprises_donnees_publiques;

alter table public.entreprises set (autovacuum_analyze_scale_factor = 0.02);

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — la mesure vieillit, elle doit pouvoir être refaite
-- ═══════════════════════════════════════════════════════════════════════════
--
-- MESURÉ APRÈS CETTE MIGRATION, le 28/08/2026, appel complet de la fonction
-- (total + neuf répartitions + la page de vingt-cinq lignes) :
--
--   · sans aucun filtre, à froid ............ 1 380 ms   (avant : > 55 s)
--   · sans aucun filtre, régime établi ......   509 ms
--   · un département ........................   138 ms
--   · un lot, page 3, tri par CA décroissant     80 ms
--   · sans site + sans SIRET ................    53 ms
--   · archivées seulement ...................    41 ms
--
-- La base rend un débit variable d'un facteur trois entre deux exécutions du
-- même plan : lire les RAPPORTS, pas les valeurs absolues.
--
--   select public.explorateur_entreprises('{}'::jsonb, 1, 25, 'nom', 'asc') -> 'total';
--   select public.explorateur_entreprises('{"departements":["75"]}'::jsonb) -> 'total';
--
-- LA LIGNE À SURVEILLER SI ÇA RALENTIT À NOUVEAU. Le symptôme n'est pas un
-- temps, c'est une ESTIMATION qui s'effondre : dès qu'un prédicat redevient
-- opaque, `entreprises` est annoncée à quelques dizaines de lignes et toutes
-- les jointures repassent en boucle imbriquée. Le nombre attendu est du même
-- ordre que le total réel (59 792 pour 60 078 au 28/08) :
--
--   explain select count(*) from ( ... ) x;   -- avec le texte rendu par :
--   select public.explorateur_base_sql('{}'::jsonb, 'nom');
--
-- Le raccourci, en une seule instruction :
--
--   do $c$
--   declare l text;
--   begin
--     for l in execute 'explain select count(*) from ('
--                      || public.explorateur_base_sql('{}'::jsonb) || ') x'
--     loop
--       if l like '%Scan on entreprises %' then raise notice '%', l; end if;
--     end loop;
--   end
--   $c$;
--
-- Et le rappel qui vaut pour toute reprise de ce fichier : ce qui a cassé le
-- plan n'était pas la taille de la table, c'était UNE FORME D'ÉCRITURE. Deux
-- écritures équivalentes pour le résultat ne le sont pas pour le planificateur —
-- un filtre lu dans un CTE, un `coalesce` là où un test booléen suffit, un
-- `limit` qui n'est pas une constante. Aucune des trois ne se signale.
