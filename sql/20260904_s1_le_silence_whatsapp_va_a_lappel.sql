-- S1 — un silence WhatsApp mène au TÉLÉPHONE, plus à l'e-mail.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE CHEMIN D'AVANT, ET POURQUOI IL AVALAIT DES PROSPECTS
-- ─────────────────────────────────────────────────────────────────────────────
-- S1 descend une échelle de canaux : WhatsApp, puis e-mail, puis appel. Les
-- deux premiers barreaux sont gardés par une condition (`waQ` : a-t-il un
-- mobile ? `mlQ` : a-t-il une adresse ?), le troisième — `ap1` — n'a aucune
-- branche : c'est le fond, tout le monde y tombe s'il n'a été retenu nulle part.
--
-- Sauf que `mlQ` n'avait, lui non plus, aucune branche. Il était donc sur le
-- TRONC, et un prospect sorti de la voie WhatsApp par le bas — deux messages,
-- quatre jours de silence — le rencontrait comme n'importe qui. S'il avait une
-- adresse, il partait dans le bras e-mail au lieu d'arriver à l'appel.
--
-- Ce bras ne mène nulle part aujourd'hui, et pour deux raisons qui se cumulent :
-- `ml1` et `ml2` portent `transport: smtp` — le transport du FROID, que la
-- politique d'usage de Resend interdit nommément et que la flotte de boîtes
-- consommables ne sert pas encore — et le régulateur est en pause. Les 397
-- blocages journalisés depuis le 28/08 portent tous `regulateur_en_pause`.
--
-- Un silencieux WhatsApp avec une adresse était donc rangé dans une impasse, à
-- l'endroit précis où le téléphone l'attendait.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QUE ÇA COÛTAIT, ET CE QUE ÇA ALLAIT COÛTER
-- ─────────────────────────────────────────────────────────────────────────────
-- Relevé le 04/09/2026 sur les inscriptions S1 `active`, par `vars.conditions` :
--
--   étape 9 (`ml1`, le bras e-mail) ..... 220, TOUTES `waQ = non`
--   étape 15 (`ap1`, l'appel) ............ 88, dont 2 `waQ = oui`
--   étapes 1 à 6 (la voie WhatsApp) ..... 218, toutes `waQ = oui`
--
-- Autrement dit : personne n'est aujourd'hui coincé dans l'e-mail APRÈS un
-- WhatsApp — les 220 n'ont pas de mobile, ils sont entrés directement par le
-- mail, et ce fichier ne les déplace pas. Deux seulement ont déjà traversé le
-- bras e-mail, et ils en sont ressortis : ils sont à l'appel.
--
-- La casse est DEVANT. Les 52 inscriptions arrêtées sur `waW2` (l'attente qui
-- suit le second WhatsApp) arrivent à échéance les 4 et 5 septembre, et 71 des
-- 89 attentes de réponse en cours portent une adresse e-mail. Sans ce
-- changement, elles rejoignaient l'impasse cette semaine.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE CHANGEMENT : UNE BRANCHE, ET RIEN D'AUTRE
-- ─────────────────────────────────────────────────────────────────────────────
-- `mlQ` reçoit `branch: {waitId: "waQ", on: "timeout"}` — il entre dans la voie
-- « pas de mobile » de la première condition. Le bras e-mail cesse d'être du
-- tronc et devient ce qu'il aurait toujours dû être : l'entrée de ceux qu'on ne
-- peut PAS joindre sur WhatsApp.
--
-- Aucune étape n'est ajoutée, supprimée ni renommée, et `ap1` ne bouge pas.
-- C'est `etapeAtteignable` (`src/lib/automations/branches.ts`) qui fait le
-- reste, et sa récursion est exactement ce qui rend le changement suffisant :
-- `ml1`, `mlW`, `mlGo`, `ml2`, `mlW2` et `mlGo2` dépendent tous de `mlQ` ou de
-- `mlW` — lui-même sur la voie de `mlQ` — ou de `mlW2`, qui l'est aussi ; une
-- fourche inatteignable rend toutes ses voies inatteignables, et la récursion
-- remonte jusqu'à `mlQ`. Un silencieux WhatsApp les saute donc TOUTES et tombe
-- sur `ap1`.
--
--   waQ = oui  →  wa1 · waW ·(silence)· wa2 · waW2 ·(silence)·  ►► ap1
--   waQ = non  →  mlQ  →  oui : ml1 · mlW · ml2 · mlW2 ·(silence)· ap1
--                         non : ►► ap1
--
-- ⚠️ CE QUI N'EST PAS TOUCHÉ, ET POURQUOI. S2 et S3 n'ont pas le défaut : leur
-- étape e-mail (`plqMl`, `repMl`) est déjà la voie « pas de mobile » d'une
-- condition `a_mobile`, jamais un repli après un silence — et dans les deux,
-- l'attente qui suit débouche sur un APPEL (`apRep`/`apChaud`/`apStd`, `repAp`).
-- S4 n'a rien à corriger pour une raison plus simple : elle ne porte AUCUNE
-- étape e-mail, et commence directement par un appel.
--
-- ⚠️ RIEN NE PART DE PLUS. Le changement ne déclenche aucun envoi : il retire
-- une étape e-mail du chemin de certains, et fait naître à la place une tâche
-- d'appel — un geste manuel, posé dans la file de l'agent propriétaire.

begin;

-- ⚠️ CETTE ARCHIVE A ÉTÉ PRISE APRÈS L'ÉCRITURE, ET ELLE NE SERT DONC À RIEN.
-- Constaté après coup : `archive_sequences_20260904` porte la définition
-- CORRIGÉE (mlQ avec sa branche), pas celle d'avant. La copie utilisable est
-- `archive_automations_20260904`, prise plus tôt le même jour par un autre
-- geste. C'est très exactement le piège que CLAUDE.md décrit — « archiver avant
-- toute écriture de masse » — et le rappeler ici vaut mieux que le retirer :
-- ce fichier est aussi le compte rendu de ce qui s'est passé.
--
-- CONSÉQUENCE PRATIQUE : le ROLLBACK en bas de fichier ne s'appuie sur AUCUNE
-- archive. Il réécrit la valeur d'avant, qui est connue et tient en un mot :
-- `branch: null`. Une restauration qui dépend d'une sauvegarde qu'on n'a pas
-- vérifiée n'est pas une restauration.
create table if not exists archive_sequences_20260904 as
select id, name, status, description, definition, settings, updated_at, now() as archive_le
from automations where kind = 'sequence';

update automations
set definition = jsonb_set(
      definition,
      '{steps}',
      (
        select jsonb_agg(
                 case
                   when s.step->>'id' = 'mlQ'
                   then s.step || '{"branch": {"waitId": "waQ", "on": "timeout"}}'::jsonb
                   else s.step
                 end
                 order by s.ord
               )
        from jsonb_array_elements(definition->'steps') with ordinality s(step, ord)
      )
    ),
    updated_at = now()
where id = '0e7a1f30-0000-4000-8000-000000000001'
  -- Idempotent : rejouer le fichier ne réécrit rien s'il est déjà passé.
  and definition->'steps' @> '[{"id": "mlQ", "branch": null}]'::jsonb;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTRÔLE — la branche est posée, et l'ordre des étapes n'a pas bougé.
-- ─────────────────────────────────────────────────────────────────────────────
-- select s.ord, s.step->>'id' as etape, s.step->>'kind' as nature, s.step->'branch' as voie
--   from automations a, lateral jsonb_array_elements(a.definition->'steps') with ordinality s(step, ord)
--  where a.id = '0e7a1f30-0000-4000-8000-000000000001' order by s.ord;
--
-- CE QU'IL FAUT VOIR NAÎTRE, dans les jours qui suivent : des tâches `call` sur
-- des fiches qui portent `waQ = oui` SANS avoir traversé le bras e-mail. Le
-- chemin n'était pas impossible avant — deux fiches l'avaient parcouru en
-- entier — il était seulement très long, et il passait par une étape qui ne
-- part pas. Le contrôle utile est donc `mlQ` : ces inscriptions ne doivent plus
-- porter de verdict pour cette condition.
-- select t.kind, e.vars->'conditions'->>'waQ' as a_un_mobile,
--        e.vars->'conditions' ? 'mlQ' as a_traverse_le_bras_email, count(*)
--   from prospection_tasks t join sequence_enrollments e on e.id = t.enrollment_id
--  where t.created_at > '2026-09-04' and e.automation_id = '0e7a1f30-0000-4000-8000-000000000001'
--  group by 1,2,3 order by 4 desc;
--
-- ROLLBACK — repose `branch: null` sur `mlQ`, l'état d'avant, sans dépendre
-- d'une archive (cf. l'avertissement en haut de fichier). Le bras e-mail
-- redevient du tronc, et un silencieux WhatsApp y retombe.
/*
update automations
set definition = jsonb_set(
      definition,
      '{steps}',
      (
        select jsonb_agg(
                 case when s.step->>'id' = 'mlQ' then jsonb_set(s.step, '{branch}', 'null'::jsonb) else s.step end
                 order by s.ord
               )
        from jsonb_array_elements(definition->'steps') with ordinality s(step, ord)
      )
    ),
    updated_at = now()
where id = '0e7a1f30-0000-4000-8000-000000000001';
*/
