-- S2 — « il a regardé » se mesure sur la DÉMO, plus sur la plaquette.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LE COMPTEUR ÉTAIT BRANCHÉ SUR NOUS
-- ─────────────────────────────────────────────────────────────────────────────
-- `vueQ` testait `plaquette_vue` pour décider si un prospect est chaud :
--
--     plaquette_vue = vrai  →  apChaud (J+2)     sinon  →  apStd (J+4)
--
-- Et le script d'`apChaud` commence par « Vous avez regardé ce que je vous ai
-- envoyé — les tarifs vous parlent, ou c'est hors sujet ? ». L'agent ouvre donc
-- l'appel sur une affirmation, et il faut qu'elle soit vraie.
--
-- Elle ne pouvait pas l'être. La plaquette part en PDF JOINT, jamais en lien —
-- c'est une règle de fond, pas un état transitoire : « c'est plus pro ».
-- Relevé le 05/09/2026 :
--
--   messages sortants ........................................ 806
--   dont porteurs d'une URL de plaquette ....................... 1
--   dont porteurs d'une URL de rapport ......................... 0
--   fiches avec un jeton de plaquette ........................ 897
--   fiches portant au moins une vue ........................... 11
--
-- Ces 11 sont exactement les fiches de la liste des « chauds ». Leurs vues
-- tombent à 5, 25 et 68 secondes de la CRÉATION du jeton, ou 92 à 194 secondes
-- d'un message sortant : la signature de l'agent qui ouvre la feuille
-- d'impression pour fabriquer le PDF — geste qui, lui, passe par la page
-- publique et incrémente `plaquette_vue()` côté serveur.
--
-- Autrement dit : ENVOYER la plaquette comptait une ouverture au prospect. Le
-- compteur mesurait nos envois, la séquence le lisait comme de l'intérêt, et
-- l'agent le récitait au téléphone.
--
-- Le commentaire de `conditions.ts` disait déjà le symptôme sans le voir :
-- « 2 plaquettes générées, 2 ouvertes. C'est peu, et pour une raison qui n'est
-- pas un défaut de mesure : on n'a presque rien envoyé. » Deux sur deux, c'est
-- 100 % — la signature d'un capteur qui se mesure lui-même.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QU'ON MET À LA PLACE
-- ─────────────────────────────────────────────────────────────────────────────
-- `demo_visitee`, le nouveau champ de condition : la démo est la SEULE pièce
-- dont l'URL part réellement chez le prospect, et GA4 la mesure par nom d'hôte.
-- C'est déjà ce que la file affiche sous forme de flamme ; la séquence peut
-- enfin s'en servir.
--
-- ⚠️ CE FICHIER EST SÛR À JOUER AVANT QUE LE CODE SOIT DÉPLOYÉ, et c'est
-- voulu. Un champ que le moteur ne connaît pas encore est évalué `non_mesure`
-- (`evaluerCondition` : « if (!CHAMPS_CONDITION.includes(c.champ)) »), et
-- `siInconnu` vaut `non` par défaut — donc tout le monde part sur `apStd`,
-- dont le script ne présume rien. C'est exactement l'état qu'on veut en
-- attendant : on cesse de faire dire des choses fausses au téléphone, sans
-- inventer un chaud qu'on ne sait pas encore mesurer. Au déploiement, la
-- condition se met à répondre pour de bon, sans second geste.
--
-- ⚠️ AUCUNE ÉTAPE N'EST AJOUTÉE NI SUPPRIMÉE. `current_step` est un INDEX dans
-- le tableau : retirer `vueQ` ou `apChaud` décalerait toutes les inscriptions
-- S2 en cours d'une étape. On ne touche qu'au contenu de la condition.

begin;

-- L'archive AVANT l'écriture. (Le 04/09, elle avait été prise après — d'où un
-- rollback inutilisable. On ne refait pas la même.)
create table if not exists archive_sequences_20260905 as
select id, name, status, description, definition, settings, updated_at, now() as archive_le
from automations where kind = 'sequence';

update automations
set definition = jsonb_set(
      definition,
      '{steps}',
      (
        select jsonb_agg(
                 case
                   when s.step->>'id' = 'vueQ'
                   then jsonb_set(s.step, '{condition}', '{"champ": "demo_visitee", "operateur": "vrai"}'::jsonb)
                   else s.step
                 end
                 order by s.ord
               )
        from jsonb_array_elements(definition->'steps') with ordinality s(step, ord)
      )
    ),
    updated_at = now()
where id = '0e7a1f30-0000-4000-8000-000000000002'
  -- Idempotent : ne réécrit rien si le fichier est déjà passé.
  and definition->'steps' @> '[{"id": "vueQ", "condition": {"champ": "plaquette_vue"}}]'::jsonb;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTRÔLE — la condition a changé, les dix étapes sont toujours là, dans
-- l'ordre, et `apChaud` / `apStd` tiennent toujours aux mêmes voies de `vueQ`.
-- ─────────────────────────────────────────────────────────────────────────────
-- select s.ord, s.step->>'id' as etape, s.step->>'kind' as nature,
--        s.step->'condition' as condition, s.step->'branch' as voie
--   from automations a, lateral jsonb_array_elements(a.definition->'steps') with ordinality s(step, ord)
--  where a.id = '0e7a1f30-0000-4000-8000-000000000002' order by s.ord;
--
-- CE QU'IL FAUT VOIR CHANGER, une fois le code déployé : des verdicts `oui` sur
-- `vueQ` chez des prospects dont la démo a VRAIMENT été visitée. Avant le
-- déploiement, tous les verdicts doivent être `non_mesure`.
-- select e.vars->'conditions'->>'vueQ' as verdict, count(*)
--   from sequence_enrollments e
--  where e.automation_id = '0e7a1f30-0000-4000-8000-000000000002'
--    and e.vars->'conditions' ? 'vueQ'
--  group by 1;
--
-- ROLLBACK — remet `plaquette_vue`. À ne jouer que si l'on accepte de
-- reprendre un compteur qui ne mesure que nous.
/*
update automations
set definition = jsonb_set(
      definition,
      '{steps}',
      (
        select jsonb_agg(
                 case when s.step->>'id' = 'vueQ'
                 then jsonb_set(s.step, '{condition}', '{"champ": "plaquette_vue", "operateur": "vrai"}'::jsonb)
                 else s.step end
                 order by s.ord
               )
        from jsonb_array_elements(definition->'steps') with ordinality s(step, ord)
      )
    ),
    updated_at = now()
where id = '0e7a1f30-0000-4000-8000-000000000002';
*/
