-- La cadence de la campagne du 17 au 26 août 2026 — À APPLIQUER AVANT LE 17.
--
-- POURQUOI CE FICHIER EXISTE
-- La colonne `agent_settings.quotas_demarchage` a été créée le 16/08, mais elle
-- vaut NULL pour le seul agent en production. Or NULL veut dire « défaut du
-- code », et le défaut du code (`DAILY_QUOTA` dans
-- src/lib/agent-portal/demarchage-buckets.ts) est de 20 appels + 20 WhatsApp +
-- 20 LinkedIn, soit 60 entreprises par jour. La campagne en vise CENT.
--
-- CE QUE ÇA CHANGE, ET CE QUE ÇA NE CHANGE PAS
-- Le plafond ne fait pas travailler moins : il fait DISPARAÎTRE de la file le
-- travail décidé. `planTasks` répartit canal par canal et repousse au lendemain
-- ce qui dépasse ; à 60 par jour, quarante des cent entreprises du 17 août
-- s'affichent au 18, quarante de plus au 19, et le décalage s'accumule jusqu'au
-- départ en congés. Rien ne le signale : les compteurs du rail sont exacts, ils
-- comptent simplement une journée plus courte que celle qui était prévue.
--
-- Trois écrans lisent ce même réglage, et c'est le but :
--   · la file de démarchage (`/api/agent/tasks` → `meta.quotas`) l'applique au
--     plan ET l'affiche en tête de rail ;
--   · l'écran sprint (`/api/agent/sprint`) en fait la cible de contacts du jour
--     — la SOMME des trois canaux, soit 100 ;
--   · rien d'autre. Aucune UI d'administration ne l'écrit à ce jour : ce
--     fichier est le seul chemin.
--
-- LA RÉPARTITION
-- 20 appels : c'est une contrainte d'horloge, pas de volume — un humain ne
-- passe pas cent appels utiles dans une journée. Le reste part en écrit, où le
-- coût marginal est faible. LinkedIn reste à 20 : les 300 fiches de la cohorte B
-- viennent de Google Maps et de l'ADEME, elles n'ont presque jamais de profil.
--
-- Une valeur hors de [1, 1000] ou non numérique est IGNORÉE par
-- `normaliseQuotas` et retombe sur le défaut du canal : ce réglage ne peut pas
-- vider la file, au pire il ne s'applique pas.

update public.agent_settings
   set quotas_demarchage = '{"call":20,"whatsapp":60,"linkedin":20}'::jsonb,
       updated_at = now()
 where agent_id = '76353de0-ac50-4645-9530-8be2db55c7a3';

-- Contrôle : doit rendre la ligne avec la somme 100.
-- select agent_id, quotas_demarchage,
--        (quotas_demarchage->>'call')::int
--      + (quotas_demarchage->>'whatsapp')::int
--      + (quotas_demarchage->>'linkedin')::int as cible_jour
--   from public.agent_settings;

-- ROLLBACK — rend la cadence ordinaire (60/jour) :
-- update public.agent_settings set quotas_demarchage = null
--  where agent_id = '76353de0-ac50-4645-9530-8be2db55c7a3';
