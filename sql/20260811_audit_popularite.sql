-- =====================================================================
-- Audit : le pilier « popularité locale » entre dans la file
-- =====================================================================
--
-- DEUX CHANGEMENTS, UNE SEULE VUE.
--
-- 1. LES ENTREPRISES SANS SITE ENTRENT DANS LA FILE.
--    La vue filtrait sur `site_web_canonique is not null`. Résultat : les 760
--    entreprises sans site — le quart du parc, et les plus faciles à convaincre
--    puisqu'il n'y a rien à démolir — n'étaient jamais analysées. La clé
--    `no_site_or_unreachable` ne se déclenchait donc que sur les sites CASSÉS,
--    jamais sur les absents. Le code qui les traite existe depuis toujours
--    (`analyserEntreprise`, branche « pas d'URL ») : il n'avait simplement
--    jamais reçu personne.
--
--    Elles ne coûtent aucune requête réseau : il n'y a rien à joindre. Le lot
--    horaire n'en est donc pas ralenti.
--
-- 2. LA VUE PORTE LE CONTEXTE QUE SEUL LE CROISEMENT DONNE.
--    Ville, nom, note moyenne, et les qualifications RGE actives. Ces champs ne
--    servent pas à noter le site : ils servent à constater ce qu'un analyseur
--    de page ne peut pas voir seul — qu'une entreprise a 43 avis et n'en montre
--    aucun, ou qu'elle détient une qualification RGE qu'elle n'affiche pas.
--
-- AUCUNE COLONNE AJOUTÉE. La note de popularité se recalcule à la lecture
-- depuis ses preuves stockées dans `detail`, précisément pour qu'une migration
-- non appliquée n'ait aucun effet de bord. Voir `noteDepuisPreuves`.
--
-- Idempotente : `create or replace`.
-- =====================================================================

create or replace view public.v_audit_site_a_rafraichir as
select
  e.id                     as entreprise_id,
  e.site_web_canonique     as url,
  e.name                   as nom,
  e.ville                  as ville,
  e.nombre_avis,
  e.note_moyenne,
  e.telephone,
  -- Qualifications encore valides, en libellés lisibles. `retiree_le` marque
  -- les retraits sans supprimer la ligne : une qualification perdue reste un
  -- renseignement commercial, mais elle ne doit pas être réclamée au prospect.
  (
    select array_agg(distinct coalesce(q.nom_qualification, q.code_qualification))
    from public.entreprise_rge_qualifications q
    where q.entreprise_id = e.id
      and q.retiree_le is null
      and (q.date_fin is null or q.date_fin >= current_date)
  )                        as qualifications_rge,
  a.analyse_le,
  a.tentatives,
  case when a.entreprise_id is null then 0 else 1 end as ordre
from public.entreprises e
left join public.entreprises_audit_site a on a.entreprise_id = e.id
where
  -- Plus de filtre sur l'URL : une entreprise sans site EST un résultat.
  e.archived_at is null
  and (
    a.entreprise_id is null
    or a.expire_le is null
    or a.expire_le < now()
    or a.url_analysee is distinct from e.site_web_canonique
  )
  and coalesce(a.tentatives, 0) < 5
order by
  case when a.entreprise_id is null then 0 else 1 end,
  a.analyse_le nulls first,
  e.id;

comment on view public.v_audit_site_a_rafraichir is
  'File d''analyse : jamais analysées d''abord, puis périmées. Inclut les entreprises sans site, qui sont un résultat et non une absence de données.';
