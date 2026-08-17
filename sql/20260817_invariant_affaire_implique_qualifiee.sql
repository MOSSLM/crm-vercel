-- Une affaire implique une entreprise qualifiée.
--
-- LA CONSIGNE, donnée par le propriétaire le 17/08 :
--   « Une opportunité doit être créée que si entreprise qualifiée ; à la limite
--     si c'est pas bon plus tard on a qu'à archiver et mettre le motif. »
--
-- CE QUI NE TENAIT PAS
-- `assignProspectToAgent` (src/app/api/admin/_assign.ts) posait `owner_id`,
-- reprenait ou créait l'affaire, semait l'appel à froid — et ne touchait jamais
-- `qualifie`. C'était même écrit comme un choix délibéré. Résultat au 17/08 :
--   · 882 opportunités
--   · 361 entreprises qualifiées
--   · 520 fiches attribuées, démarchées, et absentes de l'onglet « Qualifiés »
-- Le CRM affichait deux vérités incompatibles selon l'écran ouvert, et le
-- propriétaire l'a vu avant nous : « les entreprises qualifiées c'est vraiment
-- mal décrit ».
--
-- LA RÉPARATION, EN DEUX MOITIÉS
--   1. Le code, pour que ça ne revienne pas : attribuer qualifie désormais, dans
--      le même geste. Deux tests le tiennent (`_assign.test.ts`), dont un qui
--      vérifie qu'une entreprise DÉJÀ qualifiée n'est pas réécrite — un update
--      inutile toucherait `updated_at` et ferait passer la fiche pour modifiée.
--   2. La base, pour le passé : les 520 fiches concernées.
--
-- POURQUOI QUALIFIER PLUTÔT QUE REFUSER
-- L'invariant peut se tenir par les deux bouts. Refuser l'attribution d'une
-- fiche non qualifiée obligerait l'admin à deux gestes pour un, et aurait bloqué
-- les deux cohortes entières. La seconde moitié de la consigne tranche : l'erreur
-- se répare par un archivage motivé, pas par un barrage à l'entrée.
--
-- CE QUI RESTE SÉPARABLE
-- Le propriétaire voulait distinguer ce qu'il avait qualifié lui-même de mes
-- cohortes. `cohorte_demarchage` le fait déjà, sans colonne de plus :
--   qualifiées au total ........ 881
--   ├─ hors cohorte (les siennes) 302
--   ├─ A_site_faible ............ 282
--   └─ B_sans_site .............. 297
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ÉCRITURES DÉJÀ APPLIQUÉES le 17/08 via execute_sql. Consigné pour la trace.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. L'état d'avant, archivé AVANT l'écriture — sinon le trigger `updated_at`
--    l'aurait effacé sans qu'on puisse jamais le retrouver.
create table if not exists public.journal_qualification_20260817 (
  entreprise_id bigint primary key,
  qualifie_avant boolean,
  cohorte text,
  owner_id uuid,
  nb_opportunites int,
  archive_le timestamptz not null default now()
);

insert into public.journal_qualification_20260817 (entreprise_id, qualifie_avant, cohorte, owner_id, nb_opportunites)
select e.id, e.qualifie, e.cohorte_demarchage, e.owner_id, count(o.id)
  from public.entreprises e
  join public.opportunites o on o.entreprise_id = e.id
 where coalesce(e.qualifie, false) = false
   and e.archived_at is null
   and coalesce(o.is_test, false) = false   -- une affaire de test ne qualifie personne
 group by e.id, e.qualifie, e.cohorte_demarchage, e.owner_id
on conflict (entreprise_id) do nothing;
-- 520 lignes : 501 des cohortes, 19 d'avant les cohortes.

-- 2. L'invariant appliqué.
update public.entreprises e
   set qualifie = true
  from public.journal_qualification_20260817 j
 where e.id = j.entreprise_id
   and coalesce(e.qualifie, false) = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles
-- ─────────────────────────────────────────────────────────────────────────────
-- Plus aucune affaire réelle sur une entreprise non qualifiée : doit rendre 0.
-- select count(distinct e.id)
--   from public.entreprises e
--   join public.opportunites o on o.entreprise_id = e.id
--  where coalesce(e.qualifie,false) = false
--    and e.archived_at is null
--    and coalesce(o.is_test,false) = false;
--
-- ROLLBACK :
-- update public.entreprises e set qualifie = j.qualifie_avant
--   from public.journal_qualification_20260817 j where e.id = j.entreprise_id;
