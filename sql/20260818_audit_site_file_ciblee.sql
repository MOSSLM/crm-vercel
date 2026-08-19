-- La file d'analyse de site, resserrée sur ce qui a un sens à analyser.
--
-- CE QUE ÇA CORRIGE
-- Deux gaspillages mesurés le 18 août 2026, sur une file de 58 497 lignes :
--
--   1. 34 210 entreprises (59 %) N'ONT AUCUNE URL. La vue ne filtrait pas sur
--      la présence d'un site, donc six créneaux sur dix du cron partaient à
--      « analyser » une entreprise sans adresse. L'absence de site est une
--      information, mais elle s'écrit dans `constats_presence` — ce n'est pas
--      le travail de l'analyseur technique.
--
--   2. La péremption à 30 jours (`expire_le < now()`) remettait tout le parc
--      dans la file chaque mois. À 30 analyses/heure, le parc n'est même pas
--      parcouru une fois en 30 jours : la file se réalimentait plus vite
--      qu'elle ne se vidait, et les jamais-analysées reculaient d'autant.
--
-- CE QUI DÉCLENCHE DÉSORMAIS UNE ANALYSE
--   - l'entreprise n'a jamais été analysée, ou
--   - son URL a changé depuis la dernière analyse.
-- Rien d'autre. Une ré-analyse volontaire passe par le bouton de la fiche ou
-- par `scripts/audit/backfill.ts`, qui ne dépendent pas de cette vue.
--
-- CE QUE ÇA N'ENLÈVE PAS
-- Le garde-fou `tentatives < 5` : un site qui échoue cinq fois sort de la file
-- au lieu d'être retenté indéfiniment.
--
-- POUR REVENIR EN ARRIÈRE, l'ancienne définition (celle d'avant ce fichier) :
--
--   WHERE e.archived_at IS NULL
--     AND (a.entreprise_id IS NULL
--          OR a.expire_le IS NULL
--          OR a.expire_le < now()
--          OR a.url_analysee IS DISTINCT FROM e.site_web_canonique)
--     AND COALESCE(a.tentatives, 0) < 5
--
-- Le reste de la vue (colonnes, tri) est inchangé.

create or replace view public.v_audit_site_a_rafraichir as
  select e.id as entreprise_id,
         e.site_web_canonique as url,
         e.name as nom,
         e.ville,
         e.nombre_avis,
         e.note_moyenne,
         e.telephone,
         (select array_agg(distinct coalesce(q.nom_qualification, q.code_qualification))
            from entreprise_rge_qualifications q
           where q.entreprise_id = e.id
             and q.retiree_le is null
             and (q.date_fin is null or q.date_fin >= current_date)) as qualifications_rge,
         a.analyse_le,
         a.tentatives,
         case when a.entreprise_id is null then 0 else 1 end as ordre
    from entreprises e
    left join entreprises_audit_site a on a.entreprise_id = e.id
   where e.archived_at is null
     -- Sans adresse, il n'y a rien à mesurer : 59 % de la file partait là.
     and nullif(btrim(e.site_web_canonique), '') is not null
     -- Plus de péremption calendaire : on analyse ce qui n'a jamais été vu,
     -- et ce dont l'adresse a changé.
     and (a.entreprise_id is null
          or a.url_analysee is distinct from e.site_web_canonique)
     and coalesce(a.tentatives, 0) < 5
   order by (case when a.entreprise_id is null then 0 else 1 end),
            a.analyse_le nulls first,
            e.id;
